-- A Driver receives one pickup task per Runner/day. If more orders are assigned
-- before the Driver acknowledges the task, refresh the same task instead of
-- creating a second task or blocking the Runner.

CREATE OR REPLACE FUNCTION public.create_driver_pickup_task(
  p_runner_id uuid,
  p_driver_id uuid,
  p_pickup_date date,
  p_notes text,
  p_items jsonb,
  p_source_order_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_source_order_codes text[] DEFAULT ARRAY[]::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup_id uuid;
  v_existing_pickup public.driver_pickups%ROWTYPE;
  v_existing_buffers jsonb := '{}'::jsonb;
  v_need record;
  v_item jsonb;
  v_buffer integer;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
  v_source_order_ids uuid[];
  v_source_order_codes text[];
BEGIN
  IF NOT public.can_manage_driver_pickup_scope(p_runner_id) THEN
    RAISE EXCEPTION 'Not authorized to create pickups for this runner';
  END IF;

  IF p_pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Pickups can only be created for today';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.runner_drivers rd
    WHERE rd.runner_id = p_runner_id
      AND rd.driver_id = p_driver_id
      AND rd.is_active = true
  ) THEN
    RAISE EXCEPTION 'Driver is not active under this runner';
  END IF;

  SELECT dp.*
  INTO v_existing_pickup
  FROM public.driver_pickups dp
  WHERE dp.driver_id = p_driver_id
    AND dp.pickup_date = v_business_date
    AND dp.status = 'PENDING_DRIVER_ACK'
  ORDER BY dp.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_pickup.id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.driver_pickups dp
      WHERE dp.driver_id = p_driver_id
        AND dp.pickup_date = v_business_date
        AND dp.status IN ('PENDING_DRIVER_ACK', 'DRIVER_ACKED')
    ) THEN
      RAISE EXCEPTION 'This driver already has an active pickup for today';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.get_runner_driver_pickup_shortages(p_runner_id, p_driver_id)
    ) THEN
      RAISE EXCEPTION 'No pickup is required for this driver';
    END IF;
  ELSIF v_existing_pickup.runner_id <> p_runner_id THEN
    RAISE EXCEPTION 'This driver already has an active pickup for today';
  ELSE
    v_pickup_id := v_existing_pickup.id;

    SELECT COALESCE(
      jsonb_object_agg(
        item.product_id::text,
        jsonb_build_object('buffer_qty', GREATEST(COALESCE(item.buffer_qty, 0), 0))
      ),
      '{}'::jsonb
    )
    INTO v_existing_buffers
    FROM public.driver_pickup_items item
    WHERE item.pickup_id = v_pickup_id;

    -- The pending task can remain valid even when no new shortage exists.
    IF NOT EXISTS (
      SELECT 1
      FROM public.get_runner_driver_pickup_shortages(p_runner_id, p_driver_id)
    ) THEN
      RETURN v_pickup_id;
    END IF;
  END IF;

  SELECT
    COALESCE(array_agg(source.order_id ORDER BY source.order_id), ARRAY[]::uuid[]),
    COALESCE(array_agg(source.order_code ORDER BY source.order_id), ARRAY[]::text[])
  INTO v_source_order_ids, v_source_order_codes
  FROM public.get_runner_driver_pickup_source_orders(p_runner_id, p_driver_id) source;

  IF v_pickup_id IS NULL THEN
    INSERT INTO public.driver_pickups (
      runner_id,
      driver_id,
      pickup_date,
      notes,
      created_by,
      source_order_ids,
      source_order_codes
    )
    VALUES (
      p_runner_id,
      p_driver_id,
      p_pickup_date,
      NULLIF(BTRIM(p_notes), ''),
      auth.uid(),
      v_source_order_ids,
      v_source_order_codes
    )
    RETURNING id INTO v_pickup_id;
  ELSE
    UPDATE public.driver_pickups
    SET notes = COALESCE(NULLIF(BTRIM(p_notes), ''), notes),
        source_order_ids = v_source_order_ids,
        source_order_codes = v_source_order_codes,
        updated_at = now()
    WHERE id = v_pickup_id;
  END IF;

  DELETE FROM public.driver_pickup_items
  WHERE pickup_id = v_pickup_id;

  FOR v_need IN
    SELECT *
    FROM public.get_runner_driver_pickup_shortages(p_runner_id, p_driver_id)
  LOOP
    v_item := NULL;
    SELECT value
    INTO v_item
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    WHERE value->>'product_id' = v_need.product_id::text
    LIMIT 1;

    v_buffer := GREATEST(
      COALESCE(NULLIF(v_item->>'buffer_qty', '')::integer, 0),
      COALESCE(NULLIF(v_existing_buffers -> v_need.product_id::text ->> 'buffer_qty', '')::integer, 0),
      0
    );

    INSERT INTO public.driver_pickup_items (
      pickup_id,
      product_id,
      qty,
      required_qty,
      buffer_qty
    )
    VALUES (
      v_pickup_id,
      v_need.product_id,
      v_need.required_qty + v_buffer,
      v_need.required_qty,
      v_buffer
    );
  END LOOP;

  RETURN v_pickup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  TO authenticated;

NOTIFY pgrst, 'reload schema';
