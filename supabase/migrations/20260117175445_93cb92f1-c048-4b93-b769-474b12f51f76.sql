-- Fix role detection + unify manager team visibility scope

-- Helper: canonical team membership for a manager (active bindings)
CREATE OR REPLACE FUNCTION public.get_team_salesperson_ids(p_manager_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT msb.salesperson_id
  FROM public.manager_salesperson_bindings msb
  WHERE msb.manager_id = p_manager_id
    AND msb.active = true;
$$;

-- Keep backward compatibility (manager_groups / profiles.manager_id) while making bindings canonical.
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

  -- IMPORTANT: role source of truth is profiles (via get_user_role)
  v_role := public.get_user_role(v_user_id);

  -- Admin can see all - return NULL to indicate no filter
  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;

  -- Salesperson can only see their own data
  IF v_role = 'salesperson' THEN
    RETURN ARRAY[v_user_id];
  END IF;

  -- Manager: own + bound salespersons (canonical) (+ backward-compat fallbacks)
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
    ) team;

    RETURN v_result;
  END IF;

  -- Runner (and any other role): default to own
  RETURN ARRAY[v_user_id];
END;
$$;

-- Ensure is_in_manager_team stays consistent with canonical bindings (and keep group fallback)
CREATE OR REPLACE FUNCTION public.is_in_manager_team(salesperson_user_id uuid, manager_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.manager_salesperson_bindings
    WHERE manager_id = manager_user_id
      AND salesperson_id = salesperson_user_id
      AND active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.group_members gm
    JOIN public.manager_groups mg ON mg.id = gm.group_id
    WHERE mg.manager_user_id = manager_user_id
      AND gm.member_user_id = salesperson_user_id
  );
END;
$$;
