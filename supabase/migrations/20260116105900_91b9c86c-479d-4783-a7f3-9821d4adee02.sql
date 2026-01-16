
-- Create RPC function to get visible owner IDs for team visibility
-- This returns the user's own ID + all bound salesperson IDs (active bindings only)
CREATE OR REPLACE FUNCTION public.get_visible_owner_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role app_role;
  v_result uuid[];
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  
  -- Get user role
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_user_id
  LIMIT 1;
  
  -- Admin can see all - return NULL to indicate no filter
  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;
  
  -- Salesperson can only see their own data
  IF v_role = 'salesperson' THEN
    RETURN ARRAY[v_user_id];
  END IF;
  
  -- Manager can see own + team members from multiple sources
  IF v_role = 'manager' THEN
    -- Gather team members from:
    -- 1. manager_salesperson_bindings (active only)
    -- 2. manager_groups + group_members
    -- 3. profiles.manager_id (backward compat)
    SELECT ARRAY[v_user_id] || COALESCE(
      array_agg(DISTINCT member_id) FILTER (WHERE member_id IS NOT NULL),
      ARRAY[]::uuid[]
    )
    INTO v_result
    FROM (
      -- From manager_salesperson_bindings
      SELECT salesperson_id AS member_id
      FROM public.manager_salesperson_bindings
      WHERE manager_id = v_user_id AND active = true
      
      UNION
      
      -- From manager_groups + group_members
      SELECT gm.member_user_id AS member_id
      FROM public.manager_groups mg
      JOIN public.group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = v_user_id
      
      UNION
      
      -- From profiles.manager_id (backward compat)
      SELECT p.id AS member_id
      FROM public.profiles p
      WHERE p.manager_id = v_user_id AND p.is_active = true
    ) AS team;
    
    RETURN v_result;
  END IF;
  
  -- Runner sees only their own
  IF v_role = 'runner' THEN
    RETURN ARRAY[v_user_id];
  END IF;
  
  -- Default: own data only
  RETURN ARRAY[v_user_id];
END;
$$;

-- Create helper function to check if a user can view an owner's data
CREATE OR REPLACE FUNCTION public.can_view_owner_data(p_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visible_ids uuid[];
BEGIN
  v_visible_ids := public.get_visible_owner_ids();
  
  -- NULL means admin (can see all)
  IF v_visible_ids IS NULL THEN
    RETURN true;
  END IF;
  
  RETURN p_owner_id = ANY(v_visible_ids);
END;
$$;

-- Create RPC to get visible orders for team (optimized single query)
CREATE OR REPLACE FUNCTION public.get_team_orders(
  p_status text DEFAULT NULL,
  p_runner_status text DEFAULT NULL,
  p_reconciliation_status text DEFAULT NULL,
  p_limit int DEFAULT 500,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  order_code text,
  order_date date,
  customer_name text,
  phone text,
  address text,
  area text,
  channel text,
  notes text,
  payment_method text,
  status text,
  runner_status text,
  reconciliation_status text,
  total_qty int,
  total_amount numeric,
  discount_amount numeric,
  salesperson_id uuid,
  runner_id uuid,
  driver_id uuid,
  salesperson_name text,
  runner_name text,
  driver_name text,
  delivered_at timestamptz,
  next_delivery_date date,
  salesperson_action_required boolean,
  salesperson_action_type text,
  runner_final_outcome text,
  runner_comment text,
  failed_reason text,
  failed_next_step text,
  cancel_reason text,
  cancel_notes text,
  operational_status text,
  reschedule_flag boolean,
  created_at timestamptz,
  updated_at timestamptz,
  items_summary text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visible_ids uuid[];
BEGIN
  v_visible_ids := public.get_visible_owner_ids();
  
  RETURN QUERY
  SELECT 
    o.id,
    o.order_code,
    o.order_date,
    o.customer_name,
    o.phone,
    o.address,
    o.area,
    o.channel,
    o.notes,
    o.payment_method::text,
    o.status::text,
    o.runner_status::text,
    o.reconciliation_status::text,
    o.total_qty,
    o.total_amount,
    o.discount_amount,
    o.salesperson_id,
    o.runner_id,
    o.driver_id,
    COALESCE(sp.display_name, 'Deleted User') AS salesperson_name,
    COALESCE(rn.display_name, NULL) AS runner_name,
    COALESCE(dr.display_name, NULL) AS driver_name,
    o.delivered_at,
    o.next_delivery_date,
    o.salesperson_action_required,
    o.salesperson_action_type,
    o.runner_final_outcome,
    o.runner_comment,
    o.failed_reason,
    o.failed_next_step::text,
    o.cancel_reason,
    o.cancel_notes,
    o.operational_status,
    o.reschedule_flag,
    o.created_at,
    o.updated_at,
    (
      SELECT string_agg(
        COALESCE(p.sku_code, p.sku_name, oi.sku_label, 'Unknown') || ' x' || oi.qty::text,
        ', '
      )
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ) AS items_summary
  FROM public.orders o
  LEFT JOIN public.profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN public.profiles rn ON rn.id = o.runner_id
  LEFT JOIN public.profiles dr ON dr.id = o.driver_id
  WHERE 
    -- Apply visibility filter (NULL means admin sees all)
    (v_visible_ids IS NULL OR o.salesperson_id = ANY(v_visible_ids))
    -- Apply optional status filters
    AND (p_status IS NULL OR o.status::text = p_status)
    AND (p_runner_status IS NULL OR o.runner_status::text = p_runner_status)
    AND (p_reconciliation_status IS NULL OR o.reconciliation_status::text = p_reconciliation_status)
  ORDER BY o.order_date DESC, o.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Create RPC to get team products (with visibility)
CREATE OR REPLACE FUNCTION public.get_team_products(
  p_include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  sku_code text,
  sku_name text,
  category text,
  price numeric,
  cost numeric,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  owner_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visible_ids uuid[];
BEGIN
  v_visible_ids := public.get_visible_owner_ids();
  
  RETURN QUERY
  SELECT 
    p.id,
    p.sku_code,
    p.sku_name,
    p.category,
    p.price,
    p.cost,
    p.is_active,
    p.created_by,
    p.created_at,
    p.updated_at,
    COALESCE(pr.display_name, 'Deleted User') AS owner_name
  FROM public.products p
  LEFT JOIN public.profiles pr ON pr.id = p.created_by
  WHERE 
    (p_include_inactive OR p.is_active = true)
    AND (v_visible_ids IS NULL OR p.created_by = ANY(v_visible_ids))
  ORDER BY p.sku_code, p.sku_name;
END;
$$;

-- Create debug RPC for admins to check visibility
CREATE OR REPLACE FUNCTION public.debug_team_visibility()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role app_role;
  v_visible_ids uuid[];
  v_orders_count int;
  v_products_count int;
  v_team_members jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;
  
  -- Get role
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = v_user_id
  LIMIT 1;
  
  -- Get visible IDs
  v_visible_ids := public.get_visible_owner_ids();
  
  -- Count orders visible
  IF v_visible_ids IS NULL THEN
    SELECT COUNT(*) INTO v_orders_count FROM public.orders;
  ELSE
    SELECT COUNT(*) INTO v_orders_count 
    FROM public.orders 
    WHERE salesperson_id = ANY(v_visible_ids);
  END IF;
  
  -- Count products visible
  IF v_visible_ids IS NULL THEN
    SELECT COUNT(*) INTO v_products_count FROM public.products WHERE is_active = true;
  ELSE
    SELECT COUNT(*) INTO v_products_count 
    FROM public.products 
    WHERE is_active = true AND created_by = ANY(v_visible_ids);
  END IF;
  
  -- Get team member details
  IF v_visible_ids IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
      'id', p.id,
      'display_name', COALESCE(p.display_name, 'Deleted User'),
      'role', p.role
    ))
    INTO v_team_members
    FROM public.profiles p
    WHERE p.id = ANY(v_visible_ids) AND p.id != v_user_id;
  ELSE
    v_team_members := '[]'::jsonb;
  END IF;
  
  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'role', v_role,
    'visible_ids', v_visible_ids,
    'visible_ids_count', COALESCE(array_length(v_visible_ids, 1), 0),
    'is_admin', v_visible_ids IS NULL,
    'orders_visible_count', v_orders_count,
    'products_visible_count', v_products_count,
    'team_members', COALESCE(v_team_members, '[]'::jsonb)
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_visible_owner_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_owner_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_orders(text, text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_products(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_team_visibility() TO authenticated;
