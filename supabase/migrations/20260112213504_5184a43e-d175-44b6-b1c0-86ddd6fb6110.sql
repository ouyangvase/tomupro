-- Fix the existing stock_balance_view to use SECURITY INVOKER
DROP VIEW IF EXISTS public.stock_balance_view;

CREATE VIEW public.stock_balance_view 
WITH (security_invoker = true)
AS
SELECT 
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p.display_name AS owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  sum(sm.qty_change) AS balance_qty,
  max(sm.created_at) AS last_movement_time
FROM stock_movements sm
JOIN warehouses w ON w.id = sm.warehouse_id
JOIN profiles p ON p.id = w.owner_user_id
JOIN products pr ON pr.id = sm.product_id
WHERE sm.product_id IS NOT NULL 
  AND pr.sku_code IS NOT NULL 
  AND p.role = ANY (ARRAY['salesperson'::app_role, 'admin'::app_role])
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING sum(sm.qty_change) <> 0;