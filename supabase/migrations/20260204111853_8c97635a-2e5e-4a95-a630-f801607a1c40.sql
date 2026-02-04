
-- Update full_stock_integrity_audit to use canonical delivered view
-- This ensures Stock Audit delivered = Delivered Orders delivered

CREATE OR REPLACE FUNCTION full_stock_integrity_audit(p_owner_filter uuid DEFAULT NULL::uuid, p_status_filter text DEFAULT NULL::text)
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
  WITH 
  -- Get delivered qty from CANONICAL source (v_delivered_order_lines)
  canonical_delivered AS (
    SELECT 
      vd.product_id as prod_id,
      SUM(vd.qty_delivered) as delivered_total
    FROM v_delivered_order_lines vd
    GROUP BY vd.product_id
  ),
  -- Get other movements from stock_movements ledger
  movement_totals AS (
    SELECT
      sm.warehouse_id as wh_id,
      sm.product_id as prod_id,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.qty_change ELSE 0 END), 0) as inbound,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'ADJUSTMENT' THEN sm.qty_change ELSE 0 END), 0) as adjustment,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_IN' THEN sm.qty_change ELSE 0 END), 0) as transfer_in,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'TRANSFER_OUT' THEN ABS(sm.qty_change) ELSE 0 END), 0) as transfer_out,
      -- Still track movements-based delivered for comparison
      COALESCE(SUM(CASE WHEN sm.movement_type = 'SALE_DEDUCT' THEN ABS(sm.qty_change) ELSE 0 END), 0) as movements_delivered,
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
      -- USE CANONICAL DELIVERED (from orders, not movements)
      COALESCE(cd.delivered_total, 0)::bigint as m_delivered_qty,
      COALESCE(mt.driver_allocate, 0)::bigint as m_driver_allocate_qty,
      COALESCE(mt.returns, 0)::bigint as m_driver_return_qty,
      -- Compute balance using canonical delivered
      (COALESCE(mt.inbound, 0) + COALESCE(mt.adjustment, 0) + COALESCE(mt.transfer_in, 0) + COALESCE(mt.returns, 0)
       - COALESCE(mt.transfer_out, 0) - COALESCE(cd.delivered_total, 0) - COALESCE(mt.driver_allocate, 0))::bigint as computed_bal,
      COALESCE(cb.balance_qty, 0)::bigint as stored_bal
    FROM warehouses w
    INNER JOIN profiles p_owner ON p_owner.id = w.owner_user_id
    INNER JOIN products pr ON pr.owner_user_id = w.owner_user_id AND pr.is_active = true
    LEFT JOIN movement_totals mt ON mt.wh_id = w.id AND mt.prod_id = pr.id
    LEFT JOIN canonical_delivered cd ON cd.prod_id = pr.id
    LEFT JOIN current_balances cb ON cb.wh_id = w.id AND cb.prod_id = pr.id
    WHERE w.is_active = true
      AND (p_owner_filter IS NULL OR w.owner_user_id = p_owner_filter)
      AND (mt.wh_id IS NOT NULL OR cb.wh_id IS NOT NULL OR cd.prod_id IS NOT NULL)
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
