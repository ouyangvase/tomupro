-- Keep shared Drivers visible in separate Runner workspaces.
-- A Driver may belong to multiple Runners, but an order belongs to exactly one
-- Runner through orders.runner_id. The default workspace remains self; the
-- client may request the explicit ALL union returned by this scope function.

CREATE OR REPLACE FUNCTION private.can_runner_access_shared_workspace(
  p_target_runner_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT public.get_user_role(auth.uid())::text = 'runner'
    AND (
      p_target_runner_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.runner_drivers own_link
        JOIN public.runner_drivers shared_link
          ON shared_link.driver_id = own_link.driver_id
         AND shared_link.is_active = true
        JOIN public.profiles target_runner
          ON target_runner.id = shared_link.runner_id
         AND target_runner.role::text = 'runner'
        WHERE own_link.runner_id = auth.uid()
          AND own_link.is_active = true
          AND shared_link.runner_id = p_target_runner_id
      )
    );
$$;

REVOKE ALL ON FUNCTION private.can_runner_access_shared_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_runner_access_shared_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_runner_shared_workspace_scope(
  p_runner_id uuid DEFAULT NULL
)
RETURNS TABLE (
  runner_id uuid,
  display_name text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL
     OR public.get_user_role(v_actor)::text <> 'runner'
     OR COALESCE(p_runner_id, v_actor) <> v_actor
  THEN
    RAISE EXCEPTION 'Runner workspace scope is not permitted';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.email
  FROM public.profiles p
  WHERE p.role::text = 'runner'
    AND private.can_runner_access_shared_workspace(p.id)
  ORDER BY CASE WHEN p.id = v_actor THEN 0 ELSE 1 END,
           COALESCE(p.display_name, p.email),
           p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_runner_shared_workspace_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_shared_workspace_scope(uuid) TO authenticated;

DROP POLICY IF EXISTS "Runners can view shared workspace driver links" ON public.runner_drivers;
CREATE POLICY "Runners can view shared workspace driver links"
  ON public.runner_drivers
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid())::text = 'runner'
    AND private.can_runner_access_shared_workspace(runner_id)
  );

DROP POLICY IF EXISTS "Runners can view shared workspace orders" ON public.orders;
CREATE POLICY "Runners can view shared workspace orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid())::text = 'runner'
    AND private.can_runner_access_shared_workspace(runner_id)
  );

DROP POLICY IF EXISTS "Runners can view shared workspace order items" ON public.order_items;
CREATE POLICY "Runners can view shared workspace order items"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.get_user_role(auth.uid())::text = 'runner'
        AND private.can_runner_access_shared_workspace(o.runner_id)
    )
  );

DROP POLICY IF EXISTS "Runners can view shared workspace driver profiles" ON public.profiles;
CREATE POLICY "Runners can view shared workspace driver profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid())::text = 'runner'
    AND EXISTS (
      SELECT 1
      FROM public.runner_drivers rd
      WHERE rd.driver_id = profiles.id
        AND rd.is_active = true
        AND private.can_runner_access_shared_workspace(rd.runner_id)
    )
  );
-- Extend the canonical read boundary without replacing later lifecycle fixes
-- that may already have changed this function definition.
DO $$
DECLARE
  v_definition text;
  v_rewritten text;
  v_pattern text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_driver_assignment_source(uuid,uuid,date,date,boolean,boolean)'::regprocedure
  ) INTO v_definition;

  v_pattern := $pattern$public\.get_user_role\(auth\.uid\(\)\)::text = 'runner'[[:space:]]+AND[[:space:]]+scoped\.runner_id = auth\.uid\(\)$pattern$;
  v_replacement := $replacement$public.get_user_role(auth.uid())::text = 'runner'
      AND (scoped.runner_id = auth.uid() OR private.can_runner_access_shared_workspace(scoped.runner_id))$replacement$;
  v_rewritten := regexp_replace(v_definition, v_pattern, v_replacement, 'g');
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Unable to patch canonical Driver assignment workspace scope';
  END IF;
  EXECUTE v_rewritten;
END $$;

REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) TO authenticated;

-- Delivered Orders uses a separate SECURITY DEFINER path, so apply the same
-- explicit Runner workspace boundary there as well.
DO $$
DECLARE
  v_definition text;
  v_rewritten text;
  v_pattern text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_delivered_orders_fast(uuid,uuid,uuid[],integer,integer)'::regprocedure
  ) INTO v_definition;
  v_pattern := $pattern$public\.has_runner_assistant_permission\(auth\.uid\(\), o\.runner_id, 'deliver'\)$pattern$;
  v_replacement := $replacement$public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'deliver')
        OR (public.get_user_role(auth.uid())::text = 'runner'
            AND private.can_runner_access_shared_workspace(o.runner_id))$replacement$;
  v_rewritten := regexp_replace(v_definition, v_pattern, v_replacement, 'g');
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Unable to patch delivered-order workspace scope';
  END IF;
  EXECUTE v_rewritten;
END $$;

DO $$
DECLARE
  v_definition text;
  v_rewritten text;
  v_pattern text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_delivered_orders_fast_report(uuid,uuid,uuid[],integer,integer)'::regprocedure
  ) INTO v_definition;
  v_pattern := $pattern$AND o\.order_type <> 'MIRI_INBOUND_PICKUP'[[:space:]]+AND \(p_runner_id IS NULL$pattern$;
  v_replacement := $replacement$AND o.order_type <> 'MIRI_INBOUND_PICKUP'
      AND auth.uid() IS NOT NULL
      AND (
        public.get_user_role(auth.uid())::text IN ('admin', 'finance_viewer')
        OR o.salesperson_id = auth.uid()
        OR o.runner_id = auth.uid()
        OR o.driver_id = auth.uid()
        OR public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'deliver')
        OR (public.get_user_role(auth.uid())::text = 'runner'
            AND private.can_runner_access_shared_workspace(o.runner_id))
        OR (public.get_user_role(auth.uid())::text = 'manager'
            AND o.salesperson_id = ANY(public.get_visible_owner_ids()))
        OR EXISTS (
          SELECT 1
          FROM public.user_data_shares s
          WHERE s.viewer_user_id = auth.uid()
            AND s.subject_user_id = o.salesperson_id
            AND s.active
            AND s.scope_orders
        )
      )
      AND (p_runner_id IS NULL$replacement$;
  v_rewritten := regexp_replace(v_definition, v_pattern, v_replacement, 'g');
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Unable to patch delivered-order report workspace scope';
  END IF;
  EXECUTE v_rewritten;
END $$;

GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast(uuid, uuid, uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
