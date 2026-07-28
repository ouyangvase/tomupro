-- Keep the Stock Balance owner filter on the exact same authorization boundary
-- as the balance RPCs. This includes runner assistants acting for their runner.
CREATE OR REPLACE FUNCTION public.get_accessible_owner_ids(p_scope text DEFAULT 'orders')
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role app_role;
  v_result uuid[];
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_role = 'admin' THEN
    RETURN NULL;
  END IF;

  IF p_scope = 'stock' THEN
    RETURN COALESCE(
      ARRAY(
        SELECT DISTINCT w.owner_user_id
        FROM public.warehouses w
        WHERE w.is_active = true
          AND public.can_view_stock(w.owner_user_id, v_user_id)
        ORDER BY w.owner_user_id
      ),
      ARRAY[]::uuid[]
    );
  END IF;

  v_result := ARRAY[v_user_id];

  IF v_role = 'manager' THEN
    v_result := v_result || COALESCE(ARRAY(
      SELECT salesperson_id
      FROM public.manager_salesperson_bindings
      WHERE manager_id = v_user_id
        AND active = true
      UNION
      SELECT gm.member_user_id
      FROM public.manager_groups mg
      JOIN public.group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = v_user_id
      UNION
      SELECT id
      FROM public.profiles
      WHERE manager_id = v_user_id
        AND is_active = true
    ), ARRAY[]::uuid[]);
  END IF;

  IF v_role = 'runner' THEN
    v_result := v_result || COALESCE(ARRAY(
      SELECT salesperson_id
      FROM public.bindings
      WHERE runner_id = v_user_id
        AND active = true
      UNION
      SELECT manager_id
      FROM public.manager_runner_bindings
      WHERE runner_id = v_user_id
    ), ARRAY[]::uuid[]);
  END IF;

  v_result := v_result || COALESCE(ARRAY(
    SELECT subject_user_id
    FROM public.user_data_shares
    WHERE viewer_user_id = v_user_id
      AND active = true
      AND CASE p_scope
        WHEN 'orders' THEN scope_orders
        WHEN 'products' THEN scope_products
        WHEN 'inbound' THEN scope_inbound
        WHEN 'delivered_orders' THEN scope_delivered_orders
        WHEN 'claims' THEN scope_claims
        ELSE scope_orders
      END = true
  ), ARRAY[]::uuid[]);

  RETURN ARRAY(SELECT DISTINCT unnest(v_result));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_accessible_stock_owners()
RETURNS TABLE (
  id uuid,
  display_name text,
  role app_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    COALESCE(NULLIF(BTRIM(p.display_name), ''), p.email, 'Unknown user') AS display_name,
    p.role
  FROM public.profiles p
  WHERE p.is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.warehouses w
      WHERE w.owner_user_id = p.id
        AND w.is_active = true
    )
    AND public.can_view_stock(p.id, auth.uid())
  ORDER BY display_name, p.id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_accessible_owner_ids(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_stock_owners() TO authenticated;

NOTIFY pgrst, 'reload schema';
