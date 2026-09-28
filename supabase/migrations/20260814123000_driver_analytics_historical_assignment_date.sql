BEGIN;

-- A historical Driver cohort must use that Driver's assignment timestamp when
-- the order was later reassigned. Otherwise the current Driver's timestamp
-- can pull an older assignment into the selected day.
DO $migration$
DECLARE
  v_signature regprocedure :=
    'private.get_driver_analytics_cohort(uuid,date,date)'::regprocedure;
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  v_definition := regexp_replace(
    v_definition,
    $pattern$private\.driver_analytics_assignment_date\(\s+o\.driver_assigned_at,\s+batch\.created_at,\s+COALESCE\(history\.assignment_timestamp, assignment_audit\.created_at\)\s+\)$pattern$,
    $replacement$private.driver_analytics_assignment_date(
            CASE WHEN o.driver_id = p_driver_id THEN o.driver_assigned_at END,
            CASE WHEN o.driver_id = p_driver_id THEN batch.created_at END,
            COALESCE(history.assignment_timestamp, assignment_audit.created_at)
          )$replacement$,
    'g'
  );

  v_definition := replace(
    v_definition,
    'COALESCE(o.driver_assigned_at, batch.created_at, history.assignment_timestamp, assignment_audit.created_at, o.created_at)',
    'COALESCE(CASE WHEN o.driver_id = p_driver_id THEN o.driver_assigned_at END, CASE WHEN o.driver_id = p_driver_id THEN batch.created_at END, history.assignment_timestamp, assignment_audit.created_at, o.created_at)'
  );

  v_definition := replace(
    v_definition,
    '        o.driver_status::text,
        o.driver_delivered_at,
        o.driver_failed_at,',
    '        CASE WHEN o.driver_id = p_driver_id THEN o.driver_status::text END,
        CASE WHEN o.driver_id = p_driver_id THEN o.driver_delivered_at END,
        CASE WHEN o.driver_id = p_driver_id THEN o.driver_failed_at END,'
  );

  v_definition := regexp_replace(
    v_definition,
    $pattern$o\.driver_status::text,\s+o\.driver_delivered_at,\s+o\.driver_failed_at,$pattern$,
    $replacement$CASE WHEN o.driver_id = p_driver_id THEN o.driver_status::text END,
          CASE WHEN o.driver_id = p_driver_id THEN o.driver_delivered_at END,
          CASE WHEN o.driver_id = p_driver_id THEN o.driver_failed_at END,$replacement$,
    'g'
  );

  IF strpos(v_definition, 'CASE WHEN o.driver_id = p_driver_id THEN o.driver_assigned_at END') = 0
    OR strpos(v_definition, 'COALESCE(CASE WHEN o.driver_id = p_driver_id THEN o.driver_assigned_at END') = 0
    OR strpos(v_definition, 'CASE WHEN o.driver_id = p_driver_id THEN o.driver_status::text END') = 0
  THEN
    RAISE EXCEPTION 'Historical Driver assignment date patch did not match the deployed function';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
