-- Expired pending pickups remain as history, but must not block a new pickup
-- for the same Driver on a later business day.

DROP INDEX IF EXISTS public.idx_driver_pickups_one_pending_per_driver;
DROP INDEX IF EXISTS public.idx_driver_pickups_one_pending_per_driver_day;

CREATE UNIQUE INDEX idx_driver_pickups_one_pending_per_driver_day
  ON public.driver_pickups (driver_id, pickup_date)
  WHERE status IN ('PENDING_DRIVER_ACK', 'DRIVER_ACKED');

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

  IF EXISTS (
    SELECT 1
    FROM public.driver_pickups dp
    WHERE dp.driver_id = p_driver_id
      AND dp.pickup_date = v_business_date
      AND dp.status IN ('PENDING_DRIVER_ACK', 'DRIVER_ACKED')
  ) THEN
    RAISE EXCEPTION 'This driver already has a pickup waiting for acknowledgement';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_runner_driver_pickup_shortages(p_runner_id, p_driver_id)
  ) THEN
    RAISE EXCEPTION 'No pickup is required for this driver';
  END IF;

  SELECT
    COALESCE(array_agg(source.order_id ORDER BY source.order_id), ARRAY[]::uuid[]),
    COALESCE(array_agg(source.order_code ORDER BY source.order_id), ARRAY[]::text[])
  INTO v_source_order_ids, v_source_order_codes
  FROM public.get_runner_driver_pickup_source_orders(p_runner_id, p_driver_id) source;

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

    v_buffer := GREATEST(COALESCE(NULLIF(v_item->>'buffer_qty', '')::integer, 0), 0);

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
