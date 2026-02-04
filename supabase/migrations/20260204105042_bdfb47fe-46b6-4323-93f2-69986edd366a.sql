-- =============================================================================
-- FULL STOCK INTEGRITY REBUILD SYSTEM
-- =============================================================================

-- Drop existing functions to allow return type changes
DROP FUNCTION IF EXISTS repair_missing_stock_deductions(boolean);
DROP FUNCTION IF EXISTS apply_full_stock_rebuild(boolean);
DROP FUNCTION IF EXISTS full_stock_integrity_audit(uuid, text);
DROP FUNCTION IF EXISTS get_stock_integrity_summary();

-- 1. Add unique constraint to prevent duplicate stock deductions
DROP INDEX IF EXISTS idx_stock_movements_unique_sale_deduct;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_unique_sale_deduct 
ON stock_movements (warehouse_id, product_id, reference_id)
WHERE movement_type = 'SALE_DEDUCT' AND reference_id IS NOT NULL;

-- 2. Full Stock Integrity Audit Function
CREATE OR REPLACE FUNCTION full_stock_integrity_audit(
  p_owner_filter uuid DEFAULT NULL,
  p_status_filter text DEFAULT NULL
)
RETURNS TABLE(
  owner_user_id uuid,
  owner_name text,
  warehouse_id uuid,
  warehouse_name text,
  product_id uuid,
  sku_code text,
  sku_name text,
  inbound_qty bigint,
  adjustment_qty bigint,
  transfer_in_qty bigint,
  transfer_out_qty bigint,
  delivered_qty bigint,
  driver_allocate_qty bigint,
  driver_return_qty bigint,
  computed_balance bigint,
  stored_balance bigint,
  delta bigint,
  status text,
  issue_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH movement_totals AS (
    SELECT
      sm.warehouse_id as wh_id,
      sm.product_id as prod_id,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.qty_change ELSE 0 END), 0) as inbound,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'ADJUSTMENT' THEN sm.qty_change ELSE 0 END), 0) as adjustment,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_IN' THEN sm.qty_change ELSE 0 END), 0) as transfer_in,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_OUT' THEN ABS(sm.qty_change) ELSE 0 END), 0) as transfer_out,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'SALE_DEDUCT' THEN ABS(sm.qty_change) ELSE 0 END), 0) as delivered,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'DRIVER_ALLOCATE_PREDEDUCT' THEN ABS(sm.qty_change) ELSE 0 END), 0) as driver_allocate,
      COALESCE(SUM(CASE WHEN sm.movement_type IN ('DRIVER_RETURN', 'RETURN') THEN sm.qty_change ELSE 0 END), 0) as returns
    FROM stock_movements sm
    GROUP BY sm.warehouse_id, sm.product_id
  ),
  current_balances AS (
    SELECT 
      sbv.warehouse_id as wh_id,
      sbv.product_id as prod_id,
      sbv.balance_qty
    FROM stock_balance_view sbv
  ),
  combined AS (
    SELECT
      w.owner_user_id as o_user_id,
      p_owner.display_name as o_name,
      w.id as w_id,
      w.name as w_name,
      pr.id as p_id,
      pr.sku_code as p_sku_code,
      pr.sku_name as p_sku_name,
      COALESCE(mt.inbound, 0)::bigint as m_inbound_qty,
      COALESCE(mt.adjustment, 0)::bigint as m_adjustment_qty,
      COALESCE(mt.transfer_in, 0)::bigint as m_transfer_in_qty,
      COALESCE(mt.transfer_out, 0)::bigint as m_transfer_out_qty,
      COALESCE(mt.delivered, 0)::bigint as m_delivered_qty,
      COALESCE(mt.driver_allocate, 0)::bigint as m_driver_allocate_qty,
      COALESCE(mt.returns, 0)::bigint as m_driver_return_qty,
      (COALESCE(mt.inbound, 0) + COALESCE(mt.adjustment, 0) + COALESCE(mt.transfer_in, 0) + COALESCE(mt.returns, 0)
       - COALESCE(mt.transfer_out, 0) - COALESCE(mt.delivered, 0) - COALESCE(mt.driver_allocate, 0))::bigint as computed_bal,
      COALESCE(cb.balance_qty, 0)::bigint as stored_bal
    FROM warehouses w
    INNER JOIN profiles p_owner ON p_owner.id = w.owner_user_id
    INNER JOIN products pr ON pr.owner_user_id = w.owner_user_id AND pr.is_active = true
    LEFT JOIN movement_totals mt ON mt.wh_id = w.id AND mt.prod_id = pr.id
    LEFT JOIN current_balances cb ON cb.wh_id = w.id AND cb.prod_id = pr.id
    WHERE w.is_active = true
      AND (p_owner_filter IS NULL OR w.owner_user_id = p_owner_filter)
      AND (mt.wh_id IS NOT NULL OR cb.wh_id IS NOT NULL)
  )
  SELECT
    c.o_user_id,
    c.o_name,
    c.w_id,
    c.w_name,
    c.p_id,
    c.p_sku_code,
    c.p_sku_name,
    c.m_inbound_qty,
    c.m_adjustment_qty,
    c.m_transfer_in_qty,
    c.m_transfer_out_qty,
    c.m_delivered_qty,
    c.m_driver_allocate_qty,
    c.m_driver_return_qty,
    c.computed_bal,
    c.stored_bal,
    (c.computed_bal - c.stored_bal)::bigint,
    CASE 
      WHEN c.computed_bal < 0 THEN 'NEGATIVE'
      WHEN c.computed_bal != c.stored_bal THEN 'MISMATCH'
      ELSE 'OK'
    END,
    CASE 
      WHEN c.computed_bal < 0 AND c.m_delivered_qty > (c.m_inbound_qty + c.m_adjustment_qty + c.m_transfer_in_qty + c.m_driver_return_qty) THEN 'Over-deducted or missing inbound'
      WHEN c.computed_bal < 0 THEN 'Negative balance'
      WHEN c.computed_bal > c.stored_bal THEN 'Stored balance too low'
      WHEN c.computed_bal < c.stored_bal THEN 'Stored balance too high'
      ELSE NULL
    END
  FROM combined c
  WHERE 
    CASE 
      WHEN p_status_filter = 'OK' THEN c.computed_bal >= 0 AND c.computed_bal = c.stored_bal
      WHEN p_status_filter = 'MISMATCH' THEN c.computed_bal != c.stored_bal
      WHEN p_status_filter = 'NEGATIVE' THEN c.computed_bal < 0
      ELSE true
    END
  ORDER BY 
    CASE WHEN c.computed_bal < 0 THEN 0 ELSE 1 END,
    CASE WHEN c.computed_bal != c.stored_bal THEN 0 ELSE 1 END,
    c.o_name, c.w_name, c.p_sku_code;
END;
$$;

-- 3. Get summary stats for UI
CREATE OR REPLACE FUNCTION get_stock_integrity_summary()
RETURNS TABLE(
  total_skus bigint,
  healthy_count bigint,
  mismatch_count bigint,
  negative_count bigint,
  health_percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_ok bigint;
  v_mismatch bigint;
  v_negative bigint;
BEGIN
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE fsia.status = 'OK'),
    COUNT(*) FILTER (WHERE fsia.status = 'MISMATCH'),
    COUNT(*) FILTER (WHERE fsia.status = 'NEGATIVE')
  INTO v_total, v_ok, v_mismatch, v_negative
  FROM full_stock_integrity_audit(NULL, NULL) fsia;
  
  RETURN QUERY SELECT 
    v_total,
    v_ok,
    v_mismatch,
    v_negative,
    CASE WHEN v_total > 0 THEN ROUND((v_ok::numeric / v_total::numeric) * 100, 1) ELSE 100.0 END;
END;
$$;

-- 4. Improved Quick Repair function
CREATE OR REPLACE FUNCTION repair_missing_stock_deductions(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_count bigint := 0;
  v_fixed_count bigint := 0;
  v_queue_cleared bigint := 0;
  v_errors text[] := ARRAY[]::text[];
  v_fixed_orders text[] := ARRAY[]::text[];
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  
  SELECT COUNT(DISTINCT oi.id)
  INTO v_missing_count
  FROM orders o
  INNER JOIN order_items oi ON oi.order_id = o.id
  WHERE o.runner_status = 'DELIVERED'
    AND oi.product_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM stock_movements sm
      WHERE sm.reference_id = oi.id::text
        AND sm.movement_type = 'SALE_DEDUCT'
    );
  
  IF NOT p_dry_run AND v_missing_count > 0 THEN
    WITH delivered_items AS (
      SELECT 
        oi.id as order_item_id,
        oi.product_id,
        oi.qty,
        o.id as order_id,
        o.order_code,
        o.salesperson_id,
        COALESCE(
          get_stock_owner_warehouse(o.salesperson_id),
          (SELECT w.id FROM warehouses w WHERE w.owner_user_id = o.salesperson_id AND w.is_active = true LIMIT 1)
        ) as warehouse_id
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE o.runner_status = 'DELIVERED'
        AND oi.product_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements sm
          WHERE sm.reference_id = oi.id::text
            AND sm.movement_type = 'SALE_DEDUCT'
        )
    ),
    to_insert AS (
      SELECT DISTINCT ON (di.warehouse_id, di.product_id, di.order_item_id)
        di.warehouse_id,
        di.product_id,
        'SALE_DEDUCT'::movement_type as movement_type,
        -di.qty as qty_change,
        'ORDER_ITEM'::reference_type as reference_type,
        di.order_item_id::text as reference_id,
        v_admin_id as created_by
      FROM delivered_items di
      WHERE di.warehouse_id IS NOT NULL
    ),
    inserted AS (
      INSERT INTO stock_movements (
        warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by
      )
      SELECT ti.warehouse_id, ti.product_id, ti.movement_type, ti.qty_change, ti.reference_type, ti.reference_id, ti.created_by 
      FROM to_insert ti
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_movements sm 
        WHERE sm.warehouse_id = ti.warehouse_id 
          AND sm.product_id = ti.product_id 
          AND sm.reference_id = ti.reference_id
          AND sm.movement_type = 'SALE_DEDUCT'
      )
      RETURNING reference_id
    )
    SELECT COUNT(*) INTO v_fixed_count FROM inserted;
    
    SELECT ARRAY_AGG(DISTINCT o.order_code)
    INTO v_fixed_orders
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    INNER JOIN stock_movements sm ON sm.reference_id = oi.id::text
    WHERE sm.movement_type = 'SALE_DEDUCT' 
      AND sm.created_at > NOW() - INTERVAL '5 minutes';
    
    UPDATE orders o
    SET stock_deducted = true
    WHERE o.runner_status = 'DELIVERED'
      AND o.stock_deducted = false
      AND EXISTS (
        SELECT 1 FROM order_items oi
        INNER JOIN stock_movements sm ON sm.reference_id = oi.id::text
        WHERE oi.order_id = o.id AND sm.movement_type = 'SALE_DEDUCT'
      );
    
    UPDATE delivery_queue SET status = 'REPROCESSED', processed_at = NOW() WHERE status = 'FAILED';
    GET DIAGNOSTICS v_queue_cleared = ROW_COUNT;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'missing_deductions', v_missing_count,
    'fixed_deductions', v_fixed_count,
    'queue_cleared', v_queue_cleared,
    'errors', v_errors,
    'fixed_orders', COALESCE(v_fixed_orders, ARRAY[]::text[])
  );
END;
$$;

-- 5. Apply Full Stock Rebuild
CREATE OR REPLACE FUNCTION apply_full_stock_rebuild(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint := 0;
  v_ok bigint := 0;
  v_mismatch bigint := 0;
  v_negative bigint := 0;
  v_missing_deductions_fixed bigint := 0;
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE fsia.status = 'OK'),
    COUNT(*) FILTER (WHERE fsia.status = 'MISMATCH'),
    COUNT(*) FILTER (WHERE fsia.status = 'NEGATIVE')
  INTO v_total, v_ok, v_mismatch, v_negative
  FROM full_stock_integrity_audit(NULL, NULL) fsia;
  
  IF NOT p_dry_run THEN
    WITH delivered_items AS (
      SELECT 
        oi.id as order_item_id,
        oi.product_id,
        oi.qty,
        o.salesperson_id,
        COALESCE(
          get_stock_owner_warehouse(o.salesperson_id),
          (SELECT w.id FROM warehouses w WHERE w.owner_user_id = o.salesperson_id AND w.is_active = true LIMIT 1)
        ) as warehouse_id
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE o.runner_status = 'DELIVERED'
        AND oi.product_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements sm
          WHERE sm.reference_id = oi.id::text AND sm.movement_type = 'SALE_DEDUCT'
        )
    ),
    to_insert AS (
      SELECT DISTINCT ON (di.warehouse_id, di.product_id, di.order_item_id)
        di.warehouse_id, di.product_id,
        'SALE_DEDUCT'::movement_type as movement_type,
        -di.qty as qty_change,
        'ORDER_ITEM'::reference_type as reference_type,
        di.order_item_id::text as reference_id,
        v_admin_id as created_by
      FROM delivered_items di WHERE di.warehouse_id IS NOT NULL
    ),
    inserted_deductions AS (
      INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
      SELECT ti.warehouse_id, ti.product_id, ti.movement_type, ti.qty_change, ti.reference_type, ti.reference_id, ti.created_by
      FROM to_insert ti
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_movements sm 
        WHERE sm.warehouse_id = ti.warehouse_id AND sm.product_id = ti.product_id 
          AND sm.reference_id = ti.reference_id AND sm.movement_type = 'SALE_DEDUCT'
      )
      RETURNING id
    )
    SELECT COUNT(*) INTO v_missing_deductions_fixed FROM inserted_deductions;
    
    UPDATE orders o SET stock_deducted = true
    WHERE o.runner_status = 'DELIVERED' AND o.stock_deducted = false
      AND EXISTS (
        SELECT 1 FROM order_items oi
        INNER JOIN stock_movements sm ON sm.reference_id = oi.id::text
        WHERE oi.order_id = o.id AND sm.movement_type = 'SALE_DEDUCT'
      );
    
    UPDATE delivery_queue SET status = 'REPROCESSED', processed_at = NOW() WHERE status = 'FAILED';
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'total_skus_scanned', v_total,
    'ok_count', v_ok,
    'mismatch_count', v_mismatch,
    'negative_count', v_negative,
    'missing_deductions_fixed', v_missing_deductions_fixed
  );
END;
$$;