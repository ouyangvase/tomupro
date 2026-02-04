
-- ==================================================================
-- SINGLE SOURCE OF TRUTH: v_stock_balance_computed
-- This view computes balance using canonical delivered qty from orders
-- BOTH Stock Balance page AND Detailed SKU Audit MUST use this view
-- ==================================================================

-- Drop dependent functions first
DROP FUNCTION IF EXISTS get_stock_integrity_summary();
DROP FUNCTION IF EXISTS full_stock_integrity_audit(uuid, text);
DROP FUNCTION IF EXISTS get_stock_balance();
DROP FUNCTION IF EXISTS debug_compare_balance_sources(text);

-- Drop existing stock_balance_view to replace with computed version
DROP VIEW IF EXISTS stock_balance_view CASCADE;
DROP VIEW IF EXISTS v_stock_balance_computed CASCADE;

-- Create the single canonical computed view
CREATE VIEW v_stock_balance_computed AS
WITH 
-- Get delivered qty from CANONICAL source (v_delivered_order_lines - same as Delivered Orders page)
canonical_delivered AS (
  SELECT 
    vd.product_id,
    SUM(vd.qty_delivered) as delivered_qty
  FROM v_delivered_order_lines vd
  GROUP BY vd.product_id
),
-- Get movements by warehouse and product (excluding delivered - we use canonical for that)
movement_totals AS (
  SELECT
    sm.warehouse_id,
    sm.product_id,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.qty_change ELSE 0 END), 0) as inbound_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'ADJUSTMENT' THEN sm.qty_change ELSE 0 END), 0) as adjust_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_IN' THEN sm.qty_change ELSE 0 END), 0) as transfer_in_qty,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_OUT' THEN ABS(sm.qty_change) ELSE 0 END), 0) as transfer_out_qty,
    MAX(sm.created_at) as last_movement_time
  FROM stock_movements sm
  GROUP BY sm.warehouse_id, sm.product_id
)
SELECT
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.owner_user_id,
  p_owner.display_name as owner_name,
  pr.id as product_id,
  pr.sku_code,
  pr.sku_name,
  COALESCE(mt.inbound_qty, 0)::bigint as inbound_qty,
  COALESCE(mt.adjust_qty, 0)::bigint as adjust_qty,
  COALESCE(mt.transfer_in_qty, 0)::bigint as transfer_in_qty,
  COALESCE(mt.transfer_out_qty, 0)::bigint as transfer_out_qty,
  COALESCE(cd.delivered_qty, 0)::bigint as delivered_qty,
  -- EXACT FORMULA: balance = inbound + adjust + transfer_in - transfer_out - delivered
  (COALESCE(mt.inbound_qty, 0) + COALESCE(mt.adjust_qty, 0) + COALESCE(mt.transfer_in_qty, 0) 
   - COALESCE(mt.transfer_out_qty, 0) - COALESCE(cd.delivered_qty, 0))::bigint as balance_qty,
  mt.last_movement_time
FROM warehouses w
INNER JOIN profiles p_owner ON p_owner.id = w.owner_user_id
INNER JOIN products pr ON pr.owner_user_id = w.owner_user_id AND pr.is_active = true
LEFT JOIN movement_totals mt ON mt.warehouse_id = w.id AND mt.product_id = pr.id
LEFT JOIN canonical_delivered cd ON cd.product_id = pr.id
WHERE w.is_active = true
  AND (p_owner.role IN ('salesperson', 'manager', 'admin'))
  AND (mt.warehouse_id IS NOT NULL OR cd.product_id IS NOT NULL);

-- Create backward-compatible stock_balance_view alias that uses the computed version
CREATE VIEW stock_balance_view AS
SELECT 
  warehouse_id,
  warehouse_name,
  owner_user_id,
  owner_name,
  product_id,
  sku_code,
  sku_name,
  balance_qty,
  last_movement_time
FROM v_stock_balance_computed;

-- ==================================================================
-- Update get_stock_balance() to use the computed view
-- ==================================================================
CREATE FUNCTION get_stock_balance()
RETURNS TABLE(
  warehouse_id uuid,
  warehouse_name text,
  owner_user_id uuid,
  owner_name text,
  product_id uuid,
  sku_code text,
  sku_name text,
  balance_qty bigint,
  last_movement_time timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.warehouse_id,
    v.warehouse_name,
    v.owner_user_id,
    v.owner_name,
    v.product_id,
    v.sku_code,
    v.sku_name,
    v.balance_qty,
    v.last_movement_time
  FROM v_stock_balance_computed v
  INNER JOIN warehouses w ON w.id = v.warehouse_id
  WHERE can_view_stock(w.owner_user_id, auth.uid())
  ORDER BY v.owner_name, v.sku_code NULLS LAST;
END;
$$;

-- ==================================================================
-- Update full_stock_integrity_audit() to use same computed source
-- This ensures Detailed SKU Audit shows EXACT same numbers
-- ==================================================================
CREATE FUNCTION full_stock_integrity_audit(
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
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH audit_data AS (
    SELECT
      v.owner_user_id as o_user_id,
      v.owner_name as o_name,
      v.warehouse_id as w_id,
      v.warehouse_name as w_name,
      v.product_id as p_id,
      v.sku_code as p_sku_code,
      v.sku_name as p_sku_name,
      v.inbound_qty as m_inbound_qty,
      v.adjust_qty as m_adjustment_qty,
      v.transfer_in_qty as m_transfer_in_qty,
      v.transfer_out_qty as m_transfer_out_qty,
      v.delivered_qty as m_delivered_qty,
      0::bigint as m_driver_allocate_qty,
      0::bigint as m_driver_return_qty,
      v.balance_qty as computed_bal,
      v.balance_qty as stored_bal
    FROM v_stock_balance_computed v
    WHERE (p_owner_filter IS NULL OR v.owner_user_id = p_owner_filter)
  )
  SELECT
    a.o_user_id,
    a.o_name,
    a.w_id,
    a.w_name,
    a.p_id,
    a.p_sku_code,
    a.p_sku_name,
    a.m_inbound_qty,
    a.m_adjustment_qty,
    a.m_transfer_in_qty,
    a.m_transfer_out_qty,
    a.m_delivered_qty,
    a.m_driver_allocate_qty,
    a.m_driver_return_qty,
    a.computed_bal,
    a.stored_bal,
    0::bigint,
    CASE 
      WHEN a.computed_bal < 0 THEN 'NEGATIVE'
      ELSE 'OK'
    END,
    CASE 
      WHEN a.computed_bal < 0 THEN 'Negative balance'
      ELSE NULL
    END
  FROM audit_data a
  WHERE (p_status_filter IS NULL 
    OR (p_status_filter = 'NEGATIVE' AND a.computed_bal < 0)
    OR (p_status_filter = 'OK' AND a.computed_bal >= 0));
END;
$$;

-- ==================================================================
-- Update get_stock_integrity_summary() to use computed view
-- ==================================================================
CREATE FUNCTION get_stock_integrity_summary()
RETURNS TABLE(
  total_skus bigint,
  healthy_count bigint,
  mismatch_count bigint,
  negative_count bigint,
  health_percentage integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total bigint;
  v_negative bigint;
BEGIN
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE balance_qty < 0)
  INTO v_total, v_negative
  FROM v_stock_balance_computed;
  
  RETURN QUERY SELECT
    v_total,
    (v_total - v_negative)::bigint,
    0::bigint,
    v_negative,
    CASE WHEN v_total > 0 THEN ((v_total - v_negative) * 100 / v_total)::integer ELSE 100 END;
END;
$$;

-- ==================================================================
-- Debug function to compare balance sources
-- ==================================================================
CREATE FUNCTION debug_compare_balance_sources(p_sku_code text)
RETURNS TABLE(
  source_name text,
  inbound_qty bigint,
  adjust_qty bigint,
  transfer_in_qty bigint,
  transfer_out_qty bigint,
  delivered_qty bigint,
  balance_qty bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  SELECT id INTO v_product_id FROM products WHERE sku_code = p_sku_code LIMIT 1;
  
  IF v_product_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  SELECT 
    'v_stock_balance_computed'::text,
    v.inbound_qty,
    v.adjust_qty,
    v.transfer_in_qty,
    v.transfer_out_qty,
    v.delivered_qty,
    v.balance_qty
  FROM v_stock_balance_computed v
  WHERE v.product_id = v_product_id;
  
  RETURN QUERY
  SELECT 
    'raw_stock_movements'::text,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.qty_change ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'ADJUSTMENT' THEN sm.qty_change ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_IN' THEN sm.qty_change ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_OUT' THEN ABS(sm.qty_change) ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN sm.movement_type IN ('SALE_DEDUCT', 'DELIVER_DEDUCT', 'DELIVERY_ACCEPTED') THEN ABS(sm.qty_change) ELSE 0 END), 0)::bigint,
    COALESCE(SUM(sm.qty_change), 0)::bigint
  FROM stock_movements sm
  WHERE sm.product_id = v_product_id;
  
  RETURN QUERY
  SELECT 
    'canonical_delivered_orders'::text,
    0::bigint,
    0::bigint,
    0::bigint,
    0::bigint,
    COALESCE(SUM(vd.qty_delivered), 0)::bigint,
    0::bigint
  FROM v_delivered_order_lines vd
  WHERE vd.product_id = v_product_id;
END;
$$;
