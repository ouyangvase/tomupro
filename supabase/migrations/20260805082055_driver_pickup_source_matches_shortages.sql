-- Keep pickup audit scope aligned with the actual shortage.
-- A Driver's active assignments are the demand, while completed pickup custody
-- is the Driver's current stock on hand. Only orders whose cumulative demand
-- exceeds that on-hand quantity belong in this pickup's source list.

CREATE OR REPLACE FUNCTION public.get_runner_driver_pickup_source_orders(
  p_runner_id uuid,
  p_driver_id uuid
)
RETURNS TABLE (
  order_id uuid,
  order_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_order_items AS (
    SELECT
      assignment.order_id,
      assignment.order_code,
      assignment.operational_date,
      (item->>'product_id')::uuid AS product_id,
      GREATEST(COALESCE((item->>'qty')::integer, 0), 0) AS qty
    FROM public.get_driver_assignment_source(
      p_runner_id,
      p_driver_id,
      NULL,
      NULL,
      true,
      true
    ) assignment
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(assignment.order_data->'order_items', '[]'::jsonb)
    ) item
    WHERE NULLIF(item->>'product_id', '') IS NOT NULL
      AND GREATEST(COALESCE((item->>'qty')::integer, 0), 0) > 0
  ),
  demand_with_running_total AS (
    SELECT
      active.order_id,
      active.order_code,
      active.product_id,
      SUM(active.qty) OVER (
        PARTITION BY active.product_id
        ORDER BY active.operational_date NULLS LAST, active.order_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS running_required_qty
    FROM active_order_items active
  ),
  on_hand AS (
    SELECT
      custody.product_id,
      custody.allocated_qty AS on_hand_qty
    FROM public.get_driver_custody_stock(p_runner_id, p_driver_id) custody
  )
  SELECT DISTINCT
    demand.order_id,
    demand.order_code
  FROM demand_with_running_total demand
  LEFT JOIN on_hand
    ON on_hand.product_id = demand.product_id
  WHERE demand.running_required_qty > COALESCE(on_hand.on_hand_qty, 0)
  ORDER BY demand.order_id;
$$;

REVOKE ALL ON FUNCTION public.get_runner_driver_pickup_source_orders(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_driver_pickup_source_orders(uuid, uuid)
  TO authenticated;

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

CREATE OR REPLACE FUNCTION public.update_driver_pickup_task(
  p_pickup_id uuid,
  p_pickup_date date,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.driver_pickups%ROWTYPE;
  v_need record;
  v_item jsonb;
  v_buffer integer;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
  v_source_order_ids uuid[];
  v_source_order_codes text[];
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_scope(v_pickup.runner_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.pickup_date <> v_business_date OR p_pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Expired pickups cannot be edited; create a new pickup for today';
  END IF;

  IF v_pickup.status <> 'PENDING_DRIVER_ACK' THEN
    RAISE EXCEPTION 'Only pickups waiting for driver acknowledgement can be edited';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_runner_driver_pickup_shortages(v_pickup.runner_id, v_pickup.driver_id)
  ) THEN
    UPDATE public.driver_pickups
    SET status = 'CANCELLED',
        notes = NULLIF(BTRIM(p_notes), ''),
        cancelled_at = now(),
        updated_at = now()
    WHERE id = p_pickup_id;

    RETURN p_pickup_id;
  END IF;

  SELECT
    COALESCE(array_agg(source.order_id ORDER BY source.order_id), ARRAY[]::uuid[]),
    COALESCE(array_agg(source.order_code ORDER BY source.order_id), ARRAY[]::text[])
  INTO v_source_order_ids, v_source_order_codes
  FROM public.get_runner_driver_pickup_source_orders(v_pickup.runner_id, v_pickup.driver_id) source;

  UPDATE public.driver_pickups
  SET notes = NULLIF(BTRIM(p_notes), ''),
      source_order_ids = v_source_order_ids,
      source_order_codes = v_source_order_codes,
      updated_at = now()
  WHERE id = p_pickup_id;

  DELETE FROM public.driver_pickup_items WHERE pickup_id = p_pickup_id;

  FOR v_need IN
    SELECT *
    FROM public.get_runner_driver_pickup_shortages(v_pickup.runner_id, v_pickup.driver_id)
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
      p_pickup_id,
      v_need.product_id,
      v_need.required_qty + v_buffer,
      v_need.required_qty,
      v_buffer
    );
  END LOOP;

  RETURN p_pickup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  TO authenticated;

REVOKE ALL ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.get_runner_driver_pickup_source_orders(uuid, uuid) IS
  'Returns only active Driver orders whose cumulative product demand exceeds the Driver current custody stock.';

NOTIFY pgrst, 'reload schema';
