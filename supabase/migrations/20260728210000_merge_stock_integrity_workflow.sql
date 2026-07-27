-- Merge the stock integrity workflow around one canonical, idempotent repair.
-- Historical deployments used SALE_DEDUCT, DELIVER_DEDUCT, and
-- DELIVERY_ACCEPTED with both order-item and order-level references. Treat all
-- of those as existing deductions so a repair cannot deduct the same delivery
-- twice.

DROP FUNCTION IF EXISTS public.apply_full_stock_rebuild(boolean);
DROP FUNCTION IF EXISTS public.repair_missing_stock_deductions(boolean);

CREATE OR REPLACE FUNCTION public.repair_missing_stock_deductions(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_count integer := 0;
  v_repairable_count integer := 0;
  v_affected_orders integer := 0;
  v_missing_units bigint := 0;
  v_legacy_covered integer := 0;
  v_unresolved_warehouses integer := 0;
  v_fixed_count integer := 0;
  v_queue_count integer := 0;
  v_queue_cleared integer := 0;
  v_fixed_orders text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  WITH delivered_items AS (
    SELECT
      oi.id AS order_item_id,
      oi.order_id,
      oi.product_id,
      oi.qty,
      o.order_code,
      o.delivered_at,
      o.salesperson_id,
      COALESCE(
        (
          SELECT w.id
          FROM public.warehouses w
          JOIN public.profiles owner_profile ON owner_profile.id = o.salesperson_id
          WHERE w.owner_user_id = o.salesperson_id
            AND w.is_active = true
            AND w.warehouse_type = (
              CASE
                WHEN owner_profile.role = 'manager' THEN 'MANAGER'
                ELSE 'SALESPERSON'
              END
            )::warehouse_type
          ORDER BY w.created_at
          LIMIT 1
        ),
        o.fulfillment_warehouse_id
      ) AS warehouse_id,
      EXISTS (
        SELECT 1
        FROM public.stock_movements sm
        WHERE sm.product_id = oi.product_id
          AND sm.movement_type IN ('SALE_DEDUCT', 'DELIVER_DEDUCT', 'DELIVERY_ACCEPTED')
          AND (
            sm.reference_id = oi.id
            OR sm.reference_id = o.id
            OR sm.order_id = o.id
          )
      ) AS has_any_deduction,
      EXISTS (
        SELECT 1
        FROM public.stock_movements sm
        WHERE sm.reference_id = oi.id
          AND sm.product_id = oi.product_id
          AND sm.movement_type = 'SALE_DEDUCT'
          AND sm.reference_type = 'ORDER_ITEM'
      ) AS has_current_deduction
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.runner_status = 'DELIVERED'
      AND lower(o.status::text) <> 'cancelled'
      AND oi.product_id IS NOT NULL
  ),
  missing AS (
    SELECT *
    FROM delivered_items
    WHERE NOT has_any_deduction
  )
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE warehouse_id IS NOT NULL)::integer,
    COUNT(DISTINCT order_id)::integer,
    COALESCE(SUM(qty), 0)::bigint,
    (SELECT COUNT(*)::integer FROM delivered_items WHERE NOT has_current_deduction AND has_any_deduction),
    COUNT(*) FILTER (WHERE warehouse_id IS NULL)::integer
  INTO
    v_missing_count,
    v_repairable_count,
    v_affected_orders,
    v_missing_units,
    v_legacy_covered,
    v_unresolved_warehouses
  FROM missing;

  WITH missing_orders AS (
    SELECT DISTINCT oi.order_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.runner_status = 'DELIVERED'
      AND lower(o.status::text) <> 'cancelled'
      AND oi.product_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.stock_movements sm
        WHERE sm.product_id = oi.product_id
          AND sm.movement_type IN ('SALE_DEDUCT', 'DELIVER_DEDUCT', 'DELIVERY_ACCEPTED')
          AND (
            sm.reference_id = oi.id
            OR sm.reference_id = o.id
            OR sm.order_id = o.id
          )
      )
  )
  SELECT COUNT(*)::integer
  INTO v_queue_count
  FROM public.delivery_queue dq
  JOIN missing_orders mo ON mo.order_id = dq.order_id
  WHERE upper(dq.status::text) = 'FAILED';

  IF NOT p_dry_run AND v_repairable_count > 0 THEN
    WITH repair_candidates AS (
      SELECT
        oi.id AS order_item_id,
        oi.order_id,
        oi.product_id,
        oi.qty,
        o.order_code,
        o.delivered_at,
        o.salesperson_id,
        COALESCE(
          (
            SELECT w.id
            FROM public.warehouses w
            JOIN public.profiles owner_profile ON owner_profile.id = o.salesperson_id
            WHERE w.owner_user_id = o.salesperson_id
              AND w.is_active = true
              AND w.warehouse_type = (
                CASE
                  WHEN owner_profile.role = 'manager' THEN 'MANAGER'
                  ELSE 'SALESPERSON'
                END
              )::warehouse_type
            ORDER BY w.created_at
            LIMIT 1
          ),
          o.fulfillment_warehouse_id
        ) AS warehouse_id
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.runner_status = 'DELIVERED'
        AND lower(o.status::text) <> 'cancelled'
        AND oi.product_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.stock_movements sm
          WHERE sm.product_id = oi.product_id
            AND sm.movement_type IN ('SALE_DEDUCT', 'DELIVER_DEDUCT', 'DELIVERY_ACCEPTED')
            AND (
              sm.reference_id = oi.id
              OR sm.reference_id = o.id
              OR sm.order_id = o.id
            )
        )
    ),
    inserted AS (
      INSERT INTO public.stock_movements (
        warehouse_id,
        product_id,
        movement_type,
        qty_change,
        reference_type,
        reference_id,
        order_id,
        unique_key,
        created_by,
        created_at
      )
      SELECT
        rc.warehouse_id,
        rc.product_id,
        'SALE_DEDUCT'::movement_type,
        -rc.qty,
        'ORDER_ITEM'::reference_type,
        rc.order_item_id,
        rc.order_id,
        'STOCK_REPAIR:' || rc.order_item_id::text,
        auth.uid(),
        COALESCE(rc.delivered_at, now())
      FROM repair_candidates rc
      WHERE rc.warehouse_id IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING order_id
    )
    SELECT
      COUNT(*)::integer,
      COALESCE(array_agg(DISTINCT o.order_code), ARRAY[]::text[])
    INTO v_fixed_count, v_fixed_orders
    FROM inserted i
    JOIN public.orders o ON o.id = i.order_id;

    UPDATE public.orders o
    SET
      stock_deducted = true,
      inventory_deducted_at = COALESCE(o.inventory_deducted_at, now())
    WHERE o.runner_status = 'DELIVERED'
      AND lower(o.status::text) <> 'cancelled'
      AND NOT EXISTS (
        SELECT 1
        FROM public.order_items oi
        WHERE oi.order_id = o.id
          AND oi.product_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.stock_movements sm
            WHERE sm.product_id = oi.product_id
              AND sm.movement_type IN ('SALE_DEDUCT', 'DELIVER_DEDUCT', 'DELIVERY_ACCEPTED')
              AND (
                sm.reference_id = oi.id
                OR sm.reference_id = o.id
                OR sm.order_id = o.id
              )
          )
      );

    WITH cleared AS (
      UPDATE public.delivery_queue dq
      SET status = 'REPROCESSED', processed_at = now()
      WHERE upper(dq.status::text) = 'FAILED'
        AND EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = dq.order_id
            AND o.runner_status = 'DELIVERED'
            AND o.stock_deducted = true
        )
      RETURNING 1
    )
    SELECT COUNT(*)::integer INTO v_queue_cleared FROM cleared;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'missing_deductions', v_missing_count,
    'repairable_deductions', v_repairable_count,
    'affected_orders', v_affected_orders,
    'missing_units', v_missing_units,
    'legacy_deductions_recognized', v_legacy_covered,
    'unresolved_warehouses', v_unresolved_warehouses,
    'fixed_deductions', v_fixed_count,
    'queue_items', v_queue_count,
    'queue_cleared', v_queue_cleared,
    'errors', ARRAY[]::text[],
    'fixed_orders', v_fixed_orders
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'dry_run', p_dry_run,
    'missing_deductions', v_missing_count,
    'repairable_deductions', v_repairable_count,
    'affected_orders', v_affected_orders,
    'missing_units', v_missing_units,
    'legacy_deductions_recognized', v_legacy_covered,
    'unresolved_warehouses', v_unresolved_warehouses,
    'fixed_deductions', v_fixed_count,
    'queue_items', v_queue_count,
    'queue_cleared', v_queue_cleared,
    'errors', ARRAY[SQLERRM],
    'fixed_orders', v_fixed_orders
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_full_stock_rebuild(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_repair_result jsonb;
  v_total_skus integer := 0;
  v_ok_count integer := 0;
  v_mismatch_count integer := 0;
  v_negative_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT public.repair_missing_stock_deductions(p_dry_run)
  INTO v_repair_result;

  IF NOT COALESCE((v_repair_result->>'success')::boolean, false) THEN
    RETURN v_repair_result;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'OK'),
    COUNT(*) FILTER (WHERE status = 'MISMATCH'),
    COUNT(*) FILTER (WHERE status = 'NEGATIVE')
  INTO v_total_skus, v_ok_count, v_mismatch_count, v_negative_count
  FROM public.full_stock_integrity_audit(null, null);

  RETURN v_repair_result || jsonb_build_object(
    'total_skus_scanned', v_total_skus,
    'ok_count', v_ok_count,
    'mismatch_count', v_mismatch_count,
    'negative_count', v_negative_count,
    'missing_deductions_fixed', COALESCE((v_repair_result->>'fixed_deductions')::integer, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_missing_stock_deductions(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_full_stock_rebuild(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_missing_stock_deductions(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_full_stock_rebuild(boolean) TO authenticated;
