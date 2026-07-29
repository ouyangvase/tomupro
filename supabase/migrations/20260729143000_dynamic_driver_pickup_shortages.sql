-- Dynamic Driver pickup shortages from canonical active assignments and custody stock.
-- Driver pickup/return records remain operational and never write inventory stock movements.

CREATE OR REPLACE FUNCTION public.get_driver_custody_stock(
  p_runner_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL
)
RETURNS TABLE (
  driver_id uuid,
  product_id uuid,
  sku_name text,
  sku_code text,
  pickup_qty integer,
  returned_qty integer,
  delivered_qty integer,
  allocated_qty integer,
  pending_qty integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH completed_pickups AS (
    SELECT
      dp.driver_id,
      dpi.product_id,
      MIN(dp.pickup_date) AS first_pickup_date,
      SUM(GREATEST(COALESCE(dpi.qty, 0), 0))::integer AS pickup_qty
    FROM public.driver_pickups dp
    JOIN public.driver_pickup_items dpi ON dpi.pickup_id = dp.id
    WHERE dp.status = 'COMPLETED'
      AND (p_runner_id IS NULL OR dp.runner_id = p_runner_id)
      AND (p_driver_id IS NULL OR dp.driver_id = p_driver_id)
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR dp.driver_id = auth.uid()
        OR (
          public.get_user_role(auth.uid())::text = 'runner'
          AND dp.runner_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.runner_assistants ra
          WHERE ra.assistant_id = auth.uid()
            AND ra.runner_id = dp.runner_id
            AND ra.is_active = true
            AND ra.can_manage_driver_stock = true
        )
      )
    GROUP BY dp.driver_id, dpi.product_id
  ),
  acknowledged_returns AS (
    SELECT
      dr.driver_id,
      dri.product_id,
      SUM(GREATEST(COALESCE(dri.qty, 0), 0))::integer AS returned_qty
    FROM public.driver_returns dr
    JOIN public.driver_return_items dri ON dri.return_id = dr.id
    WHERE dr.status = 'RUNNER_ACKED'
      AND (p_runner_id IS NULL OR dr.runner_id = p_runner_id)
      AND (p_driver_id IS NULL OR dr.driver_id = p_driver_id)
    GROUP BY dr.driver_id, dri.product_id
  ),
  accepted_deliveries AS (
    SELECT
      o.driver_id,
      oi.product_id,
      SUM(GREATEST(COALESCE(oi.qty, 0), 0))::integer AS delivered_qty
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN (
      SELECT driver_id, MIN(first_pickup_date) AS first_pickup_date
      FROM completed_pickups
      GROUP BY driver_id
    ) first_pickup ON first_pickup.driver_id = o.driver_id
    WHERE o.driver_status::text = 'DRIVER_DELIVERED'
      AND o.runner_accept_status::text = 'ACCEPTED'
      AND COALESCE(o.driver_delivered_at, o.delivered_at)::date >= first_pickup.first_pickup_date
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
    GROUP BY o.driver_id, oi.product_id
  )
  SELECT
    pickup.driver_id,
    pickup.product_id,
    COALESCE(product.sku_name, 'Unlinked product')::text,
    product.sku_code::text,
    pickup.pickup_qty,
    COALESCE(returned.returned_qty, 0)::integer,
    COALESCE(delivered.delivered_qty, 0)::integer,
    GREATEST(
      pickup.pickup_qty
        - COALESCE(returned.returned_qty, 0)
        - COALESCE(delivered.delivered_qty, 0),
      0
    )::integer AS allocated_qty,
    GREATEST(
      pickup.pickup_qty
        - COALESCE(returned.returned_qty, 0)
        - COALESCE(delivered.delivered_qty, 0),
      0
    )::integer AS pending_qty
  FROM completed_pickups pickup
  LEFT JOIN acknowledged_returns returned
    ON returned.driver_id = pickup.driver_id
    AND returned.product_id = pickup.product_id
  LEFT JOIN accepted_deliveries delivered
    ON delivered.driver_id = pickup.driver_id
    AND delivered.product_id = pickup.product_id
  LEFT JOIN public.products product ON product.id = pickup.product_id
  WHERE GREATEST(
    pickup.pickup_qty
      - COALESCE(returned.returned_qty, 0)
      - COALESCE(delivered.delivered_qty, 0),
    0
  ) > 0
  ORDER BY pickup.driver_id, COALESCE(product.sku_name, 'Unlinked product');
$$;

CREATE OR REPLACE FUNCTION public.get_runner_driver_pickup_shortages(
  p_runner_id uuid,
  p_driver_id uuid DEFAULT NULL
)
RETURNS TABLE (
  driver_id uuid,
  product_id uuid,
  sku_name text,
  sku_code text,
  active_required_qty integer,
  on_hand_qty integer,
  required_qty integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_items AS (
    SELECT
      assignment.driver_id,
      (item->>'product_id')::uuid AS product_id,
      SUM(GREATEST(COALESCE((item->>'qty')::integer, 0), 0))::integer AS active_required_qty,
      MAX(item->'product'->>'sku_name') AS sku_name,
      MAX(item->'product'->>'sku_code') AS sku_code
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
    GROUP BY assignment.driver_id, (item->>'product_id')::uuid
  ),
  custody AS (
    SELECT *
    FROM public.get_driver_custody_stock(p_runner_id, p_driver_id)
  )
  SELECT
    active.driver_id,
    active.product_id,
    COALESCE(active.sku_name, product.sku_name, 'Unlinked product')::text,
    COALESCE(active.sku_code, product.sku_code)::text,
    active.active_required_qty,
    COALESCE(custody.allocated_qty, 0)::integer AS on_hand_qty,
    GREATEST(active.active_required_qty - COALESCE(custody.allocated_qty, 0), 0)::integer
  FROM active_items active
  LEFT JOIN custody
    ON custody.driver_id = active.driver_id
    AND custody.product_id = active.product_id
  LEFT JOIN public.products product ON product.id = active.product_id
  WHERE active.active_required_qty > COALESCE(custody.allocated_qty, 0)
  ORDER BY active.driver_id, COALESCE(active.sku_name, product.sku_name, 'Unlinked product');
$$;

DROP INDEX IF EXISTS public.idx_driver_pickups_one_active_per_day;
DROP INDEX IF EXISTS public.idx_driver_pickups_one_pending_per_driver;

CREATE UNIQUE INDEX idx_driver_pickups_one_pending_per_driver
  ON public.driver_pickups (driver_id)
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
  FROM public.get_driver_assignment_source(
    p_runner_id,
    p_driver_id,
    NULL,
    NULL,
    true,
    false
  ) source;

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
  FROM public.get_driver_assignment_source(
    v_pickup.runner_id,
    v_pickup.driver_id,
    NULL,
    NULL,
    true,
    false
  ) source;

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

REVOKE ALL ON FUNCTION public.get_driver_custody_stock(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_runner_driver_pickup_shortages(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_driver_custody_stock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_runner_driver_pickup_shortages(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.get_driver_custody_stock(uuid, uuid) IS
  'Driver operational custody: completed pickups minus acknowledged returns and Runner-accepted deliveries. No inventory movement writes.';

COMMENT ON FUNCTION public.get_runner_driver_pickup_shortages(uuid, uuid) IS
  'Dynamic pickup shortage: canonical active assigned-order demand minus current Driver custody stock.';

NOTIFY pgrst, 'reload schema';
