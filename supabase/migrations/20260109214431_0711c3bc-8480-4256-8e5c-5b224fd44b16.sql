
-- Fix the get_stock_balance function with correct can_view_stock argument order
CREATE OR REPLACE FUNCTION public.get_stock_balance()
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
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
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
  INNER JOIN public.stock_movements sm ON sm.warehouse_id = w.id
  INNER JOIN public.products pr ON pr.id = sm.product_id
  LEFT JOIN public.profiles p_owner ON p_owner.id = w.owner_user_id
  WHERE w.is_active = true
    AND sm.product_id IS NOT NULL
    AND pr.sku_code IS NOT NULL
    -- Fix: correct argument order (owner_id, viewer_id)
    AND public.can_view_stock(w.owner_user_id, auth.uid())
  GROUP BY w.id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name
  HAVING SUM(sm.qty_change) <> 0
$$;
