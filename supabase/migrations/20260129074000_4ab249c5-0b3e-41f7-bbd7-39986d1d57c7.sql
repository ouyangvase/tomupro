CREATE OR REPLACE FUNCTION public.search_visible_orders(
  p_query text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  order_code text,
  customer_name text,
  status text,
  runner_status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_role app_role;
  v_visible_ids uuid[];
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  v_role := public.get_user_role(v_user_id);
  v_visible_ids := public.get_visible_owner_ids();
  
  RETURN QUERY
  SELECT 
    o.id,
    o.order_code,
    o.customer_name,
    o.status::text,
    o.runner_status::text,
    o.created_at
  FROM public.orders o
  WHERE 
    -- Search filter
    (o.order_code ILIKE '%' || p_query || '%' 
     OR o.customer_name ILIKE '%' || p_query || '%')
    -- Visibility filter based on role
    AND (
      v_visible_ids IS NULL  -- Admin sees all
      OR o.salesperson_id = ANY(v_visible_ids)  -- Visible salespersons
      OR o.runner_id = v_user_id  -- Runner sees their assigned orders
      OR o.driver_id = v_user_id  -- Driver sees their assigned orders
    )
  ORDER BY o.created_at DESC
  LIMIT p_limit;
END;
$$;