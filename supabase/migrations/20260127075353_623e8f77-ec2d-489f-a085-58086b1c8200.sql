-- Fix: Include user_data_shares subjects in get_visible_owner_ids() function
-- This allows shared users' orders to be visible in Ready Sales, Booking Sales, 
-- Action Required, and Dashboard stats

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

  v_role := public.get_user_role(v_user_id);

  -- Admin can see all - return NULL to indicate no filter
  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;

  -- Salesperson: own data + any shared subjects
  IF v_role = 'salesperson' THEN
    SELECT ARRAY[v_user_id] || COALESCE(
      array_agg(DISTINCT uds.subject_user_id) FILTER (WHERE uds.subject_user_id IS NOT NULL),
      ARRAY[]::uuid[]
    )
    INTO v_result
    FROM public.user_data_shares uds
    WHERE uds.viewer_user_id = v_user_id
      AND uds.active = true
      AND uds.scope_orders = true;
    
    RETURN v_result;
  END IF;

  -- Manager: own + bound salespersons + shared subjects
  IF v_role = 'manager' THEN
    SELECT ARRAY[v_user_id] || COALESCE(
      array_agg(DISTINCT member_id) FILTER (WHERE member_id IS NOT NULL),
      ARRAY[]::uuid[]
    )
    INTO v_result
    FROM (
      -- Canonical: manager_salesperson_bindings
      SELECT msb.salesperson_id AS member_id
      FROM public.manager_salesperson_bindings msb
      WHERE msb.manager_id = v_user_id
        AND msb.active = true

      UNION

      -- Backward compat: manager_groups + group_members
      SELECT gm.member_user_id AS member_id
      FROM public.manager_groups mg
      JOIN public.group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = v_user_id

      UNION

      -- Backward compat: profiles.manager_id
      SELECT p.id AS member_id
      FROM public.profiles p
      WHERE p.manager_id = v_user_id
        AND p.is_active = true

      UNION

      -- NEW: Data sharing subjects (scope_orders = true)
      SELECT uds.subject_user_id AS member_id
      FROM public.user_data_shares uds
      WHERE uds.viewer_user_id = v_user_id
        AND uds.active = true
        AND uds.scope_orders = true
    ) team;

    RETURN v_result;
  END IF;

  -- Runner (and any other role): own data + any shared subjects
  SELECT ARRAY[v_user_id] || COALESCE(
    array_agg(DISTINCT uds.subject_user_id) FILTER (WHERE uds.subject_user_id IS NOT NULL),
    ARRAY[]::uuid[]
  )
  INTO v_result
  FROM public.user_data_shares uds
  WHERE uds.viewer_user_id = v_user_id
    AND uds.active = true
    AND uds.scope_orders = true;
  
  RETURN v_result;
END;
$$;