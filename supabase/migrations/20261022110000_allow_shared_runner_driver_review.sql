-- Keep Driver report writes aligned with the shared Runner workspace read scope.
-- A Runner may review another Runner's report only when both workspaces share
-- an active Driver. The order's original runner_id remains unchanged.
DO $$
DECLARE
  v_definition text;
  v_rewritten text;
  v_pattern text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure
  ) INTO v_definition;

  v_pattern := $pattern$IF[[:space:]]+v_order\.runner_id IS DISTINCT FROM p_actor_id[[:space:]]+AND[[:space:]]+NOT public\.has_runner_assistant_permission\([[:space:]]*p_actor_id,[[:space:]]*v_order\.runner_id,[[:space:]]*'driver_operations'[[:space:]]*\)$pattern$;
  v_replacement := $replacement$IF v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT (
      public.has_runner_assistant_permission(
        p_actor_id,
        v_order.runner_id,
        'driver_operations'
      )
      OR (
        public.get_user_role(p_actor_id)::text = 'runner'
        AND private.can_runner_access_shared_workspace(v_order.runner_id)
      )
    )$replacement$;
  v_rewritten := regexp_replace(v_definition, v_pattern, v_replacement, 'g');
  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Unable to patch Driver report review workspace scope';
  END IF;
  EXECUTE v_rewritten;
END $$;

GRANT EXECUTE ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
