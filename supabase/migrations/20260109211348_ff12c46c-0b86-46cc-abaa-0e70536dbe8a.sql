-- Fix Security Definer View issue by using SECURITY INVOKER (default)
-- The can_view_stock function handles the security logic

DROP VIEW IF EXISTS stock_balance_view CASCADE;

-- Recreate with explicit SECURITY INVOKER
CREATE VIEW stock_balance_view 
WITH (security_invoker = true)
AS
SELECT 
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p_owner.display_name AS owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  SUM(sm.qty_change) AS balance_qty,
  MAX(sm.created_at) AS last_movement_time
FROM stock_movements sm
JOIN warehouses w ON w.id = sm.warehouse_id
LEFT JOIN profiles p_owner ON p_owner.id = w.owner_user_id
LEFT JOIN products pr ON pr.id = sm.product_id
WHERE can_view_stock(w.owner_user_id, auth.uid())
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING SUM(sm.qty_change) != 0;