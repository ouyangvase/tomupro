-- Fix 1: Update profiles RLS policy to require authentication
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Profiles viewable by authenticated users" ON public.profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Fix 2: For stock_balance_view, we need to use security_invoker = true
-- Since it's a view, we need to recreate it with proper security settings
-- First, get the view definition and recreate with security_invoker
DROP VIEW IF EXISTS public.stock_balance_view;

CREATE VIEW public.stock_balance_view 
WITH (security_invoker = true)
AS
SELECT 
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p_owner.display_name AS owner_name,
  prod.id AS product_id,
  prod.sku_code,
  prod.sku_name,
  COALESCE(SUM(sm.qty_change), 0) AS balance_qty,
  MAX(sm.created_at) AS last_movement_time
FROM public.warehouses w
LEFT JOIN public.profiles p_owner ON w.owner_user_id = p_owner.id
LEFT JOIN public.stock_movements sm ON sm.warehouse_id = w.id
LEFT JOIN public.products prod ON sm.product_id = prod.id
WHERE prod.id IS NOT NULL
GROUP BY w.id, w.name, w.owner_user_id, p_owner.display_name, prod.id, prod.sku_code, prod.sku_name;