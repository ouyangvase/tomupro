-- Current Driver work is valid only while the order still has a live Runner
-- assignment and remains in the canonical READY queue. Historical Driver
-- analytics uses a separate cohort source and is intentionally unaffected.
DO $$
DECLARE
  v_signature regprocedure :=
    'public.get_driver_assignment_source(uuid,uuid,date,date,boolean,boolean)'::regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  v_rewritten := replace(
    v_definition,
    E'      AND (\n        p_active_only IS NOT TRUE\n        OR classified.lifecycle_state IN (''ASSIGNED_ACTIVE'', ''DRIVER_DELIVERED_PENDING_REVIEW'', ''DRIVER_FAILED_PENDING_REVIEW'')\n      )',
    E'      AND (\n        p_active_only IS NOT TRUE\n        OR (\n          classified.lifecycle_state IN (''ASSIGNED_ACTIVE'', ''DRIVER_DELIVERED_PENDING_REVIEW'', ''DRIVER_FAILED_PENDING_REVIEW'')\n          AND classified.current_operational_state = ''READY''\n          AND classified.runner_id IS NOT NULL\n          AND classified.runner_status::text IN (''ASSIGNED'', ''TAKEN'')\n        )\n      )'
  );

  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Expected active Driver assignment predicate was not found';
  END IF;

  EXECUTE v_rewritten;
END;
$$;

NOTIFY pgrst, 'reload schema';
