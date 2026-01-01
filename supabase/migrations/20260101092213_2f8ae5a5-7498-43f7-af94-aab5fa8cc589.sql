-- Drop the security definer view and recreate without security definer
DROP VIEW IF EXISTS public.stock_balance_view;

-- Recreate as a regular view (not security definer)
CREATE VIEW public.stock_balance_view WITH (security_invoker = true) AS
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
FROM public.stock_movements sm
JOIN public.warehouses w ON sm.warehouse_id = w.id
JOIN public.profiles p_owner ON w.owner_user_id = p_owner.id
JOIN public.products pr ON sm.product_id = pr.id
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name;