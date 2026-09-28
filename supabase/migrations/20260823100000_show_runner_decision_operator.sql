-- Runner decision rows must identify the Runner who accepted/rejected the
-- Driver result. Never infer the operator from the Driver name.

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.get_order_journey(text[],date,date,timestamptz)'::regprocedure;
  v_definition text;
  v_runner_projection text := E'da.driver_id,\n              dp.display_name AS driver_name,\n              da.result_type,';
  v_runner_projection_with_actor text := E'da.driver_id,\n              dp.display_name AS driver_name,\n              (\n                SELECT COALESCE(al.performed_by_name, decision_actor.display_name)\n                FROM public.audit_logs al\n                LEFT JOIN public.profiles decision_actor\n                  ON decision_actor.id = COALESCE(al.performed_by_user_id, al.actor_id)\n                WHERE (al.entity_id = so.id OR al.order_id = so.id)\n                  AND al.created_at = da.runner_decision_at\n                  AND upper(COALESCE(al.action_type, al.action, \'\')) IN (\n                    \'DRIVER_DELIVERY_ACCEPTED\', \'DRIVER_FAILURE_ACCEPTED\',\n                    \'DRIVER_RESCHEDULE_ACCEPTED\', \'DRIVER_DELIVERY_DEFERRED\',\n                    \'DRIVER_DELIVERY_TOMORROW_ACCEPTED\', \'DRIVER_REPORT_REJECTED\',\n                    \'DRIVER_BATCH_SCHEDULED_TOMORROW\', \'ACTION_REQUIRED_RESOLVED_TO_READY\'\n                  )\n                ORDER BY al.created_at, al.id\n                LIMIT 1\n              ) AS runner_name,\n              da.result_type,';
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, v_runner_projection_with_actor) > 0 THEN
    RETURN;
  END IF;

  IF strpos(v_definition, v_runner_projection) = 0 THEN
    RAISE EXCEPTION 'get_order_journey runner decision projection was not recognized';
  END IF;

  v_definition := replace(v_definition, v_runner_projection, v_runner_projection_with_actor);
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
