-- Recreate stock_balance_view as a regular view (not security definer)
-- Security will be enforced at application layer using can_view_stock function
DROP VIEW IF EXISTS public.stock_balance_view;

CREATE VIEW public.stock_balance_view AS
SELECT 
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.owner_user_id,
  p_owner.display_name as owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  COALESCE(SUM(sm.qty_change), 0) as balance_qty,
  MAX(sm.created_at) as last_movement_time
FROM public.warehouses w
LEFT JOIN public.stock_movements sm ON sm.warehouse_id = w.id
LEFT JOIN public.products pr ON pr.id = sm.product_id
LEFT JOIN public.profiles p_owner ON p_owner.id = w.owner_user_id
WHERE w.is_active = true
  AND (sm.product_id IS NULL OR pr.is_active = true)
GROUP BY w.id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING COALESCE(SUM(sm.qty_change), 0) != 0 OR sm.product_id IS NOT NULL;