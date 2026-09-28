-- Driver workload/read sources must agree with the canonical order line.
-- Keep historical assignment classification, but never expose a stale active
-- assignment from a non-READY/non-final canonical state.
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
    E'      AND coalesce(o.delivery_area_code, '''') NOT IN (''SELF_PICKUP'', ''CANCELLED'')',
    E'      AND coalesce(o.delivery_area_code, '''') NOT IN (''SELF_PICKUP'', ''CANCELLED'')
      AND (
        o.current_operational_state = ''READY''
        OR (
          o.current_operational_state = ''DELIVERED''
          AND o.runner_status::text = ''DELIVERED''
        )
        OR (
          o.current_operational_state = ''ACTION_REQUIRED''
          AND o.runner_status::text = ''FAILED_DELIVERY''
          AND coalesce(o.runner_review_status::text, ''NOT_REVIEWED'') = ''REVIEWED''
        )
      )'
  );

  IF v_rewritten <> v_definition THEN
    EXECUTE v_rewritten;
  ELSIF strpos(v_definition, 'o.current_operational_state') = 0 THEN
    RAISE EXCEPTION 'Expected canonical Driver source scope was not found';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
