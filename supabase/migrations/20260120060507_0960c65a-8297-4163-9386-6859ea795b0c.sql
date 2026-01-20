-- Fix the get_stock_owner_warehouse function to be role-aware (with proper enum cast)
CREATE OR REPLACE FUNCTION public.get_stock_owner_warehouse(p_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id
  FROM orders o
  JOIN profiles p ON p.id = o.salesperson_id
  JOIN warehouses w ON w.owner_user_id = o.salesperson_id
  WHERE o.id = p_order_id
    AND w.warehouse_type = (CASE 
      WHEN p.role = 'manager' THEN 'MANAGER'
      ELSE 'SALESPERSON'
    END)::warehouse_type
    AND w.is_active = true
  LIMIT 1;
$$;