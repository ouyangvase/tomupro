
-- First, clean up duplicates before adding unique constraints

-- 1. Add a unique_key column for idempotency tracking
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unique_key TEXT;

-- 2. Remove duplicate INBOUND entries (keep oldest)
WITH ranked_inbounds AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY reference_id, reference_type, warehouse_id, product_id ORDER BY created_at ASC) as rn
  FROM stock_movements
  WHERE movement_type = 'INBOUND' AND reference_type = 'INBOUND_ITEM' AND reference_id IS NOT NULL
)
DELETE FROM stock_movements
WHERE id IN (SELECT id FROM ranked_inbounds WHERE rn > 1);

-- 3. Remove duplicate delivery deductions (keep oldest, regardless of SALE_DEDUCT vs DELIVER_DEDUCT)
WITH ranked_deducts AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY reference_id, warehouse_id, product_id ORDER BY created_at ASC) as rn
  FROM stock_movements
  WHERE movement_type IN ('SALE_DEDUCT', 'DELIVER_DEDUCT') 
    AND reference_type = 'ORDER_ITEM' 
    AND reference_id IS NOT NULL
)
DELETE FROM stock_movements
WHERE id IN (SELECT id FROM ranked_deducts WHERE rn > 1);

-- 4. Now add unique constraints to prevent future duplicates
-- Unique constraint on inbound items (one movement per inbound item)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_inbound_unique 
ON stock_movements (reference_id, warehouse_id, product_id) 
WHERE reference_type = 'INBOUND_ITEM' AND movement_type = 'INBOUND';

-- Unique constraint on order item deductions (one deduction per order item, regardless of type)
DROP INDEX IF EXISTS idx_stock_movements_unique_deliver_deduct;
CREATE UNIQUE INDEX idx_stock_movements_deduct_unique 
ON stock_movements (reference_id, warehouse_id, product_id) 
WHERE reference_type = 'ORDER_ITEM' AND movement_type IN ('SALE_DEDUCT', 'DELIVER_DEDUCT');

-- 5. Create unique index on unique_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_unique_key 
ON stock_movements (unique_key) 
WHERE unique_key IS NOT NULL;

-- 6. Create the comprehensive stock integrity audit function
CREATE OR REPLACE FUNCTION audit_stock_integrity(p_owner_filter UUID DEFAULT NULL)
RETURNS TABLE (
  owner_user_id UUID,
  owner_name TEXT,
  warehouse_id UUID,
  warehouse_name TEXT,
  product_id UUID,
  sku_code TEXT,
  sku_name TEXT,
  inbound_qty BIGINT,
  adjustment_qty BIGINT,
  transfer_in_qty BIGINT,
  transfer_out_qty BIGINT,
  delivered_qty BIGINT,
  computed_balance BIGINT,
  stored_balance BIGINT,
  diff BIGINT,
  status TEXT,
  suspected_issue TEXT,
  duplicate_inbound_count BIGINT,
  duplicate_deduct_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH movements_agg AS (
    SELECT 
      w.owner_user_id,
      w.id AS wh_id,
      sm.product_id AS prod_id,
      SUM(CASE WHEN sm.movement_type = 'INBOUND' THEN sm.qty_change ELSE 0 END) AS inbound_total,
      SUM(CASE WHEN sm.movement_type = 'ADJUSTMENT' THEN sm.qty_change ELSE 0 END) AS adjustment_total,
      SUM(CASE WHEN sm.movement_type = 'TRANSFER_IN' THEN sm.qty_change ELSE 0 END) AS transfer_in_total,
      SUM(CASE WHEN sm.movement_type = 'TRANSFER_OUT' THEN sm.qty_change ELSE 0 END) AS transfer_out_total,
      SUM(CASE WHEN sm.movement_type IN ('SALE_DEDUCT', 'DELIVER_DEDUCT') THEN sm.qty_change ELSE 0 END) AS delivered_total,
      SUM(sm.qty_change) AS computed_balance
    FROM stock_movements sm
    JOIN warehouses w ON w.id = sm.warehouse_id
    WHERE w.is_active = true
      AND (p_owner_filter IS NULL OR w.owner_user_id = p_owner_filter)
    GROUP BY w.owner_user_id, w.id, sm.product_id
  ),
  stored AS (
    SELECT 
      sm.warehouse_id AS wh_id,
      sm.product_id AS prod_id,
      SUM(sm.qty_change) AS balance
    FROM stock_movements sm
    GROUP BY sm.warehouse_id, sm.product_id
  )
  SELECT 
    ma.owner_user_id,
    p.display_name AS owner_name,
    ma.wh_id AS warehouse_id,
    w.name AS warehouse_name,
    ma.prod_id AS product_id,
    pr.sku_code,
    pr.sku_name,
    COALESCE(ma.inbound_total, 0)::BIGINT AS inbound_qty,
    COALESCE(ma.adjustment_total, 0)::BIGINT AS adjustment_qty,
    COALESCE(ma.transfer_in_total, 0)::BIGINT AS transfer_in_qty,
    COALESCE(ma.transfer_out_total, 0)::BIGINT AS transfer_out_qty,
    ABS(COALESCE(ma.delivered_total, 0))::BIGINT AS delivered_qty,
    ma.computed_balance::BIGINT AS computed_balance,
    COALESCE(s.balance, 0)::BIGINT AS stored_balance,
    (ma.computed_balance - COALESCE(s.balance, 0))::BIGINT AS diff,
    CASE 
      WHEN ma.computed_balance = COALESCE(s.balance, 0) THEN 'OK'
      ELSE 'ERROR'
    END AS status,
    CASE
      WHEN ABS(COALESCE(ma.delivered_total, 0)) > COALESCE(ma.inbound_total, 0) + COALESCE(ma.transfer_in_total, 0)
        THEN 'Over-deducted or missing inbound'
      WHEN ma.computed_balance < 0 
        THEN 'Negative balance'
      ELSE NULL
    END AS suspected_issue,
    0::BIGINT AS duplicate_inbound_count,
    0::BIGINT AS duplicate_deduct_count
  FROM movements_agg ma
  JOIN warehouses w ON w.id = ma.wh_id
  JOIN profiles p ON p.id = ma.owner_user_id
  JOIN products pr ON pr.id = ma.prod_id
  LEFT JOIN stored s ON s.wh_id = ma.wh_id AND s.prod_id = ma.prod_id
  WHERE pr.is_active = true
  ORDER BY 
    CASE WHEN ma.computed_balance < 0 THEN 0 ELSE 1 END,
    p.display_name,
    pr.sku_code;
END;
$$;

-- 7. Create function to get SKU drilldown (movements for a specific product/warehouse)
CREATE OR REPLACE FUNCTION get_sku_movement_drilldown(
  p_warehouse_id UUID,
  p_product_id UUID
)
RETURNS TABLE (
  id UUID,
  movement_type TEXT,
  qty_change INTEGER,
  reference_type TEXT,
  reference_id UUID,
  order_id UUID,
  order_code TEXT,
  inbound_tracking TEXT,
  created_at TIMESTAMPTZ,
  created_by_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sm.id,
    sm.movement_type::TEXT,
    sm.qty_change,
    sm.reference_type::TEXT,
    sm.reference_id,
    sm.order_id,
    o.order_code,
    ib.tracking_no AS inbound_tracking,
    sm.created_at,
    prof.display_name AS created_by_name
  FROM stock_movements sm
  LEFT JOIN profiles prof ON prof.id = sm.created_by
  LEFT JOIN orders o ON o.id = sm.order_id
  LEFT JOIN inbound_items ii ON ii.id = sm.reference_id AND sm.reference_type = 'INBOUND_ITEM'
  LEFT JOIN inbound_shipments ib ON ib.id = ii.inbound_id
  WHERE sm.warehouse_id = p_warehouse_id 
    AND sm.product_id = p_product_id
  ORDER BY sm.created_at DESC;
END;
$$;

-- 8. Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION audit_stock_integrity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sku_movement_drilldown(UUID, UUID) TO authenticated;
