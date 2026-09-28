BEGIN;

-- Driver Analytics now attributes records only to the order's current Driver.
-- Remove the obsolete historical-evidence CTE from the shared cohort used by
-- the analytics RPCs. The previous scope patch stopped using that CTE for
-- results, but it still scanned audit_logs and delivery_attempts once per
-- Driver, making the Runner page unnecessarily slow.
DO $migration$
DECLARE
  v_signature regprocedure :=
    'private.get_driver_analytics_cohort(uuid,date,date)'::regprocedure;
  v_definition text;
  v_cte_start integer;
  v_cte_marker integer;
  v_cte_marker_end integer;
  v_cte_marker_text constant text := '), assigned_orders AS (';
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, 'historical_driver_evidence') = 0 THEN
    RETURN;
  END IF;

  v_cte_start := strpos(v_definition, '  WITH historical_driver_evidence AS (');
  v_cte_marker := v_cte_start
    + strpos(substring(v_definition FROM v_cte_start), v_cte_marker_text)
    - 1;
  v_cte_marker_end := v_cte_marker + length(v_cte_marker_text) - 1;

  IF v_cte_start = 0 OR v_cte_marker <= v_cte_start THEN
    RAISE EXCEPTION 'Driver Analytics cohort obsolete CTE was not found';
  END IF;

  v_definition := substring(v_definition FROM 1 FOR v_cte_start - 1)
    || '  WITH assigned_orders AS ('
    || substring(v_definition FROM v_cte_marker_end + 1);

  v_definition := regexp_replace(
    v_definition,
    '    LEFT JOIN historical_driver_evidence history[[:space:]]+ON history\.order_id = o\.id[[:space:]]+',
    '',
    'g'
  );
  v_definition := regexp_replace(
    v_definition,
    'COALESCE\(history\.assignment_timestamp, assignment_audit\.created_at\)',
    'assignment_audit.created_at',
    'g'
  );
  v_definition := regexp_replace(
    v_definition,
    '[[:space:]]+WHEN history\.assignment_timestamp IS NOT NULL THEN ''driver_assignment_history''[[:space:]]+',
    E'\n',
    'g'
  );
  v_definition := replace(v_definition, 'history.assignment_timestamp, ', '');

  IF strpos(v_definition, 'historical_driver_evidence') > 0
    OR strpos(v_definition, 'history.') > 0
  THEN
    RAISE EXCEPTION 'Driver Analytics cohort obsolete history references remain';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) FROM PUBLIC;
NOTIFY pgrst, 'reload schema';

COMMIT;
