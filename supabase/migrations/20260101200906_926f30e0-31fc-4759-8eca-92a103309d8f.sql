-- Fix stock_balance_view security by replacing with a SECURITY DEFINER function
-- that uses the existing can_view_stock() function to enforce access control

-- Drop the existing view
DROP VIEW IF EXISTS public.stock_balance_view;

-- Create a SECURITY DEFINER function that returns stock balance with proper access control
CREATE OR REPLACE FUNCTION public.get_stock_balance()
RETURNS TABLE (
  warehouse_id uuid,
  warehouse_name text,
  owner_user_id uuid,
  owner_name text,
  product_id uuid,
  sku_code text,
  sku_name text,
  balance_qty bigint,
  last_movement_time timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  LEFT JOIN public.stock_movements sm ON sm.warehouse_id = w.id
  LEFT JOIN public.products pr ON pr.id = sm.product_id
  LEFT JOIN public.profiles p_owner ON p_owner.id = w.owner_user_id
  WHERE w.is_active = true
    -- Enforce access control using existing can_view_stock function
    AND public.can_view_stock(auth.uid(), w.owner_user_id)
  GROUP BY w.id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name
$$;

-- Create a view that wraps the function for backward compatibility
-- This allows existing code using stock_balance_view to continue working
CREATE VIEW public.stock_balance_view AS
SELECT * FROM public.get_stock_balance();

-- Grant access to the function and view
GRANT EXECUTE ON FUNCTION public.get_stock_balance() TO authenticated;
GRANT SELECT ON public.stock_balance_view TO authenticated;