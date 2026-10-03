-- Keep active Runner selectors aligned with account offboarding.
-- Historical orders and claims retain their runner_id; this only limits current choices.

CREATE OR REPLACE FUNCTION public.get_finance_overview_runners()
RETURNS TABLE (id UUID, display_name TEXT, email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_role := public.get_user_role(v_actor)::TEXT;
  IF v_role NOT IN ('admin', 'manager', 'finance_viewer', 'runner') THEN
    RAISE EXCEPTION 'Finance overview is not available for this role';
  END IF;
  RETURN QUERY
  SELECT p.id, p.display_name, p.email
  FROM public.profiles p
  WHERE p.role::TEXT = 'runner'
    AND p.is_active = true
    AND p.status::TEXT = 'active'
    AND (
      v_role IN ('admin', 'finance_viewer')
      OR p.id = v_actor
      OR (v_role = 'manager' AND EXISTS (
        SELECT 1 FROM public.manager_runner_bindings b
        WHERE b.manager_id = v_actor AND b.runner_id = p.id
      ))
    )
  ORDER BY p.display_name NULLS LAST, p.email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_overview_runners() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_overview_runners() TO authenticated;

COMMENT ON FUNCTION public.get_finance_overview_runners()
  IS 'Returns only active Runner accounts permitted for the Finance Overview picker; historical records remain queryable by their stored runner id.';
