-- A Driver can be linked to more than one Runner. Keep one pickup per
-- Driver/day, merge every linked Runner's active demand into that task, and
-- make the task visible to every linked Runner.

CREATE OR REPLACE FUNCTION public.can_manage_driver_pickup_driver(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.get_user_role(auth.uid())::text = 'admin'
    OR (
      public.get_user_role(auth.uid())::text = 'runner'
      AND EXISTS (
        SELECT 1
        FROM public.runner_drivers rd
        WHERE rd.runner_id = auth.uid()
          AND rd.driver_id = p_driver_id
          AND rd.is_active = true
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      JOIN public.runner_drivers rd
        ON rd.runner_id = ra.runner_id
       AND rd.is_active = true
      WHERE ra.assistant_id = auth.uid()
        AND rd.driver_id = p_driver_id
        AND ra.is_active = true
        AND ra.can_manage_driver_stock = true
    );
$$;

CREATE OR REPLACE FUNCTION public.get_driver_pickup_global_stock(
  p_runner_id uuid,
  p_driver_id uuid DEFAULT NULL
)
RETURNS TABLE (
  driver_id uuid,
  product_id uuid,
  allocated_qty integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_driver_pickup_scope(p_runner_id)
     AND (p_driver_id IS NULL OR NOT public.can_manage_driver_pickup_driver(p_driver_id)) THEN
    RAISE EXCEPTION 'Not authorized to view pickup requirements for this runner';
  END IF;

  RETURN QUERY
  WITH target_drivers AS (
    SELECT DISTINCT rd.driver_id
    FROM public.runner_drivers rd
    WHERE rd.runner_id = p_runner_id
      AND rd.is_active = true
      AND (p_driver_id IS NULL OR rd.driver_id = p_driver_id)
  ),
  completed_pickups AS (
    SELECT
      dp.driver_id,
      dpi.product_id,
      MIN(dp.pickup_date) AS first_pickup_date,
      SUM(GREATEST(COALESCE(dpi.qty, 0), 0))::integer AS pickup_qty
    FROM public.driver_pickups dp
    JOIN target_drivers target ON target.driver_id = dp.driver_id
    JOIN public.driver_pickup_items dpi ON dpi.pickup_id = dp.id
    WHERE dp.status = 'COMPLETED'
    GROUP BY dp.driver_id, dpi.product_id
  ),
  acknowledged_returns AS (
    SELECT
      dr.driver_id,
      dri.product_id,
      SUM(GREATEST(COALESCE(dri.qty, 0), 0))::integer AS returned_qty
    FROM public.driver_returns dr
    JOIN target_drivers target ON target.driver_id = dr.driver_id
    JOIN public.driver_return_items dri ON dri.return_id = dr.id
    WHERE dr.status = 'RUNNER_ACKED'
    GROUP BY dr.driver_id, dri.product_id
  ),
  accepted_deliveries AS (
    SELECT
      o.driver_id,
      oi.product_id,
      SUM(GREATEST(COALESCE(oi.qty, 0), 0))::integer AS delivered_qty
    FROM public.orders o
    JOIN target_drivers target ON target.driver_id = o.driver_id
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN (
      SELECT completed.driver_id, MIN(completed.first_pickup_date) AS first_pickup_date
      FROM completed_pickups completed
      GROUP BY completed.driver_id
    ) first_pickup ON first_pickup.driver_id = o.driver_id
    WHERE o.driver_status::text = 'DRIVER_DELIVERED'
      AND o.runner_accept_status::text = 'ACCEPTED'
      AND COALESCE(o.driver_delivered_at, o.delivered_at)::date >= first_pickup.first_pickup_date
    GROUP BY o.driver_id, oi.product_id
  )
  SELECT
    pickup.driver_id,
    pickup.product_id,
    GREATEST(
      pickup.pickup_qty
        - COALESCE(returned.returned_qty, 0)
        - COALESCE(delivered.delivered_qty, 0),
      0
    )::integer AS allocated_qty
  FROM completed_pickups pickup
  LEFT JOIN acknowledged_returns returned
    ON returned.driver_id = pickup.driver_id
   AND returned.product_id = pickup.product_id
  LEFT JOIN accepted_deliveries delivered
    ON delivered.driver_id = pickup.driver_id
   AND delivered.product_id = pickup.product_id
  WHERE GREATEST(
    pickup.pickup_qty
      - COALESCE(returned.returned_qty, 0)
      - COALESCE(delivered.delivered_qty, 0),
    0
  ) > 0;
END;
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_driver_pickup_scope(p_runner_id)
     AND (p_driver_id IS NULL OR NOT public.can_manage_driver_pickup_driver(p_driver_id)) THEN
    RAISE EXCEPTION 'Not authorized to view pickup requirements for this runner';
  END IF;

  RETURN QUERY
  WITH target_drivers AS (
    SELECT DISTINCT rd.driver_id
    FROM public.runner_drivers rd
    WHERE rd.runner_id = p_runner_id
      AND rd.is_active = true
      AND (p_driver_id IS NULL OR rd.driver_id = p_driver_id)
  ),
  active_items AS (
    SELECT
      o.driver_id,
      oi.product_id,
      SUM(GREATEST(COALESCE(oi.qty, 0), 0))::integer AS active_required_qty
    FROM public.orders o
    JOIN target_drivers target ON target.driver_id = o.driver_id
    JOIN public.runner_drivers link
      ON link.runner_id = o.runner_id
     AND link.driver_id = o.driver_id
     AND link.is_active = true
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
      AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
      AND COALESCE(o.operational_status::text, '') NOT IN (
        'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
      )
      AND NOT (
        o.runner_review_status::text = 'REVIEWED'
        AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
      )
      AND GREATEST(COALESCE(oi.qty, 0), 0) > 0
    GROUP BY o.driver_id, oi.product_id
  ),
  custody AS (
    SELECT *
    FROM public.get_driver_pickup_global_stock(p_runner_id, p_driver_id)
  )
  SELECT
    active.driver_id,
    active.product_id,
    COALESCE(product.sku_name, 'Unlinked product')::text,
    product.sku_code::text,
    active.active_required_qty,
    COALESCE(custody.allocated_qty, 0)::integer,
    GREATEST(active.active_required_qty - COALESCE(custody.allocated_qty, 0), 0)::integer
  FROM active_items active
  LEFT JOIN custody
    ON custody.driver_id = active.driver_id
   AND custody.product_id = active.product_id
  LEFT JOIN public.products product ON product.id = active.product_id
  WHERE active.active_required_qty > COALESCE(custody.allocated_qty, 0)
  ORDER BY active.driver_id, COALESCE(product.sku_name, 'Unlinked product');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_runner_driver_pickup_source_orders(
  p_runner_id uuid,
  p_driver_id uuid
)
RETURNS TABLE (
  order_id uuid,
  order_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_driver_pickup_scope(p_runner_id)
     AND NOT public.can_manage_driver_pickup_driver(p_driver_id) THEN
    RAISE EXCEPTION 'Not authorized to view pickup requirements for this runner';
  END IF;

  RETURN QUERY
  WITH active_order_items AS (
    SELECT
      o.id AS order_id,
      o.order_code,
      public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) AS operational_date,
      oi.product_id,
      GREATEST(COALESCE(oi.qty, 0), 0) AS qty
    FROM public.orders o
    JOIN public.runner_drivers target
      ON target.driver_id = o.driver_id
     AND target.runner_id = p_runner_id
     AND target.is_active = true
    JOIN public.runner_drivers link
      ON link.runner_id = o.runner_id
     AND link.driver_id = o.driver_id
     AND link.is_active = true
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.driver_id = p_driver_id
      AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
      AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
      AND COALESCE(o.operational_status::text, '') NOT IN (
        'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
      )
      AND NOT (
        o.runner_review_status::text = 'REVIEWED'
        AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
      )
      AND oi.product_id IS NOT NULL
      AND GREATEST(COALESCE(oi.qty, 0), 0) > 0
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
    SELECT stock.product_id, stock.allocated_qty
    FROM public.get_driver_pickup_global_stock(p_runner_id, p_driver_id) stock
  )
  SELECT DISTINCT
    demand.order_id,
    demand.order_code
  FROM demand_with_running_total demand
  LEFT JOIN on_hand
    ON on_hand.product_id = demand.product_id
  WHERE demand.running_required_qty > COALESCE(on_hand.allocated_qty, 0)
  ORDER BY demand.order_id;
END;
$$;

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
        AND dp.status = 'DRIVER_ACKED'
    ) THEN
      RAISE EXCEPTION 'This driver already has an acknowledged pickup for today';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.get_runner_driver_pickup_shortages(p_runner_id, p_driver_id)
    ) THEN
      RAISE EXCEPTION 'No pickup is required for this driver';
    END IF;
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

    -- A pending task stays open even if the latest order snapshot has no
    -- shortage. The next linked Runner can still refresh it later today.
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
  v_product_id uuid;
  v_buffer integer;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
  v_source_order_ids uuid[];
  v_source_order_codes text[];
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_driver(v_pickup.driver_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.pickup_date <> v_business_date OR p_pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Expired pickups cannot be edited; create a new pickup for today';
  END IF;

  IF v_pickup.status <> 'PENDING_DRIVER_ACK' THEN
    RAISE EXCEPTION 'Only pickups waiting for driver acknowledgement can be edited';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Pickup items must be an array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) item
    GROUP BY item->>'product_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate pickup products are not allowed';
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

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    BEGIN
      v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Pickup item has an invalid product ID';
    END;

    SELECT *
    INTO v_need
    FROM public.get_runner_driver_pickup_shortages(v_pickup.runner_id, v_pickup.driver_id)
    WHERE product_id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is no longer required for this pickup', v_product_id;
    END IF;

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

CREATE OR REPLACE FUNCTION public.cancel_driver_pickup_task(p_pickup_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.driver_pickups%ROWTYPE;
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_driver(v_pickup.driver_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.status <> 'PENDING_DRIVER_ACK' THEN
    RAISE EXCEPTION 'Only pickups awaiting driver acknowledgement can be cancelled';
  END IF;

  UPDATE public.driver_pickups
  SET status = 'CANCELLED',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_pickup_id;

  RETURN p_pickup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_driver_pickup_task(p_pickup_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.driver_pickups%ROWTYPE;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_driver(v_pickup.driver_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Expired pickups cannot be completed; create a new pickup for today';
  END IF;

  IF v_pickup.status <> 'DRIVER_ACKED' THEN
    RAISE EXCEPTION 'Pickup must be acknowledged by the driver before completion';
  END IF;

  UPDATE public.driver_pickup_items
  SET collected_qty = qty
  WHERE pickup_id = p_pickup_id;

  UPDATE public.driver_pickups
  SET status = 'COMPLETED',
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = p_pickup_id;

  RETURN p_pickup_id;
END;
$$;

DROP POLICY IF EXISTS "Runner can manage their pickups" ON public.driver_pickups;
DROP POLICY IF EXISTS "Runners can manage pickups for linked drivers" ON public.driver_pickups;
CREATE POLICY "Runners can manage pickups for linked drivers"
  ON public.driver_pickups FOR ALL
  USING (
    runner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.runner_drivers rd
      WHERE rd.runner_id = auth.uid()
        AND rd.driver_id = driver_pickups.driver_id
        AND rd.is_active = true
    )
  )
  WITH CHECK (
    runner_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.runner_drivers rd
      WHERE rd.runner_id = auth.uid()
        AND rd.driver_id = driver_pickups.driver_id
        AND rd.is_active = true
    )
  );

DROP POLICY IF EXISTS "Access pickup items through pickup" ON public.driver_pickup_items;
CREATE POLICY "Access pickup items through pickup"
  ON public.driver_pickup_items FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.driver_pickups dp
      WHERE dp.id = driver_pickup_items.pickup_id
        AND (
          dp.runner_id = auth.uid()
          OR dp.driver_id = auth.uid()
          OR public.get_user_role(auth.uid())::text = 'admin'
          OR EXISTS (
            SELECT 1
            FROM public.runner_drivers rd
            WHERE rd.runner_id = auth.uid()
              AND rd.driver_id = dp.driver_id
              AND rd.is_active = true
          )
        )
    )
  );

REVOKE ALL ON FUNCTION public.can_manage_driver_pickup_driver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_driver_pickup_global_stock(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_runner_driver_pickup_shortages(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_runner_driver_pickup_source_orders(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_driver_pickup_task(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_driver_pickup_task(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_runner_driver_pickup_shortages(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_runner_driver_pickup_source_orders(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_driver_pickup_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_driver_pickup_task(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_runner_driver_pickup_shortages(uuid, uuid) IS
  'Driver-level pickup shortage across every active Runner binding, reduced by all Driver custody stock.';
COMMENT ON FUNCTION public.create_driver_pickup_task(uuid, uuid, date, text, jsonb, uuid[], text[]) IS
  'Creates one Driver/day pickup or refreshes the existing pending task across linked Runner scopes.';

NOTIFY pgrst, 'reload schema';
