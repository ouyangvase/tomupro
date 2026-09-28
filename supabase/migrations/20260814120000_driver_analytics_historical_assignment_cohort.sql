BEGIN;

-- Driver Analytics must retain orders that were historically assigned to the
-- selected Driver, even when Runner processing later clears or changes the
-- current orders.driver_id. Outcomes are still counted only when there is
-- evidence of a submission by that Driver.
DO $migration$
DECLARE
  v_signature regprocedure :=
    'private.get_driver_analytics_cohort(uuid,date,date)'::regprocedure;
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, 'historical_driver_evidence') > 0 THEN
    RETURN;
  END IF;

  v_definition := replace(
    v_definition,
    '  WITH assigned_orders AS (',
    $replacement$
  WITH historical_driver_evidence AS (
    SELECT
      evidence.order_id,
      MAX(evidence.assignment_timestamp)
        FILTER (WHERE evidence.evidence_type = 'assignment') AS assignment_timestamp,
      BOOL_OR(evidence.delivered_submitted) AS delivered_submitted,
      BOOL_OR(evidence.failed_submitted) AS failed_submitted,
      BOOL_OR(evidence.has_attempt) AS has_attempt
    FROM (
      SELECT
        audit.entity_id AS order_id,
        audit.created_at AS assignment_timestamp,
        'assignment'::text AS evidence_type,
        false AS delivered_submitted,
        false AS failed_submitted,
        false AS has_attempt
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.after_json->>'driver_id' = p_driver_id::text
        AND upper(replace(COALESCE(audit.action, ''), ' ', '_')) IN (
          'DRIVER_ASSIGNED',
          'DRIVER_REASSIGNED',
          'ORDER_ASSIGNED_TO_DRIVER',
          'DRIVER_CHANGED'
        )

      UNION ALL

      SELECT
        attempt.order_id,
        attempt.submitted_at AS assignment_timestamp,
        'attempt'::text AS evidence_type,
        attempt.result_type = 'DRIVER_DELIVERED_SUBMITTED' AS delivered_submitted,
        attempt.result_type = 'DRIVER_FAILED_SUBMITTED' AS failed_submitted,
        true AS has_attempt
      FROM public.delivery_attempts attempt
      WHERE attempt.driver_id = p_driver_id
    ) evidence
    GROUP BY evidence.order_id
  ), assigned_orders AS (
    $replacement$
  );

  v_definition := replace(
    v_definition,
    '      assignment_audit.created_at AS assignment_audit_at,',
    '      COALESCE(history.assignment_timestamp, assignment_audit.created_at) AS assignment_audit_at,'
  );

  v_definition := replace(
    v_definition,
    '    FROM public.orders o
    LEFT JOIN public.driver_assignment_batches batch',
    '    FROM public.orders o
    LEFT JOIN historical_driver_evidence history
      ON history.order_id = o.id
    LEFT JOIN public.driver_assignment_batches batch'
  );

  v_definition := replace(
    v_definition,
    '      o.driver_status::text IN (''DRIVER_DELIVERED'', ''DRIVER_FAILED'')',
    '      (o.driver_id = p_driver_id OR history.order_id IS NOT NULL)
        AND o.driver_status::text IN (''DRIVER_DELIVERED'', ''DRIVER_FAILED'')'
  );

  v_definition := replace(
    v_definition,
    '      o.driver_status::text = ''DRIVER_DELIVERED''',
    '      (o.driver_id = p_driver_id OR COALESCE(history.delivered_submitted, false))
        AND o.driver_status::text = ''DRIVER_DELIVERED'''
  );

  v_definition := replace(
    v_definition,
    '      o.driver_status::text = ''DRIVER_FAILED''',
    '      (o.driver_id = p_driver_id OR COALESCE(history.failed_submitted, false))
        AND o.driver_status::text = ''DRIVER_FAILED'''
  );

  v_definition := replace(
    v_definition,
    '      o.runner_final_outcome::text = ''RESCHEDULE''',
    '      (o.driver_id = p_driver_id OR COALESCE(history.has_attempt, false))
        AND o.runner_final_outcome::text = ''RESCHEDULE'''
  );

  v_definition := replace(
    v_definition,
    $old$          assignment_audit.created_at
$old$,
    $new$          COALESCE(history.assignment_timestamp, assignment_audit.created_at)
$new$
  );

  v_definition := replace(
    v_definition,
    '      COALESCE(o.driver_assigned_at, batch.created_at, assignment_audit.created_at, o.created_at) AS assignment_timestamp,',
    '      COALESCE(o.driver_assigned_at, batch.created_at, history.assignment_timestamp, assignment_audit.created_at, o.created_at) AS assignment_timestamp,'
  );

  v_definition := replace(
    v_definition,
    $old$        WHEN batch.created_at IS NOT NULL THEN 'driver_assignment_batch'
        WHEN assignment_audit.created_at IS NOT NULL THEN 'assignment_audit'$old$,
    $new$        WHEN batch.created_at IS NOT NULL THEN 'driver_assignment_batch'
        WHEN history.assignment_timestamp IS NOT NULL THEN 'driver_assignment_history'
        WHEN assignment_audit.created_at IS NOT NULL THEN 'assignment_audit'$new$
  );

  v_definition := replace(
    v_definition,
    '    WHERE o.driver_id = p_driver_id',
    '    WHERE (o.driver_id = p_driver_id OR history.order_id IS NOT NULL)'
  );

  v_definition := replace(
    v_definition,
    $old$    false,
    liabilities.total_amount::numeric,$old$,
    $new$    (liabilities.driver_id IS DISTINCT FROM p_driver_id),
    liabilities.total_amount::numeric,$new$
  );

  IF strpos(v_definition, 'history.order_id IS NOT NULL') = 0
    OR strpos(v_definition, 'historical_driver_evidence') = 0
  THEN
    RAISE EXCEPTION 'Driver Analytics cohort patch did not match the deployed function';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

-- Expose the historical Driver result in the selected-day order rows so the
-- UI can explain orders whose current Driver assignment was later cleared.
DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.get_driver_analytics_day(uuid,date)'::regprocedure;
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, 'historical_driver_result_type') > 0 THEN
    RETURN;
  END IF;

  v_definition := replace(
    v_definition,
    $old$    LEFT JOIN LATERAL (
      SELECT jsonb_agg($old$,
    $new$    LEFT JOIN LATERAL (
      SELECT
        attempt.result_type,
        attempt.failure_reason,
        attempt.remark,
        attempt.reschedule_date,
        attempt.submitted_at
      FROM public.delivery_attempts attempt
      WHERE attempt.order_id = payment_rows.order_id
        AND attempt.driver_id = p_driver_id
      ORDER BY attempt.submitted_at DESC, attempt.created_at DESC
      LIMIT 1
    ) latest_attempt ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg($new$
  );

  v_definition := replace(
    v_definition,
    $old$        'reassigned', false,
        'order_items',$old$,
    $new$        'reassigned', payment_rows.reassigned,
        'historical_driver_id', p_driver_id,
        'historical_driver_result_type', latest_attempt.result_type,
        'historical_driver_failure_reason', latest_attempt.failure_reason,
        'historical_driver_remark', latest_attempt.remark,
        'historical_driver_reschedule_date', latest_attempt.reschedule_date,
        'historical_driver_submitted_at', latest_attempt.submitted_at,
        'order_items', $new$
  );

  IF strpos(v_definition, 'historical_driver_result_type') = 0 THEN
    RAISE EXCEPTION 'Driver Analytics detail patch did not match the deployed function';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) FROM PUBLIC;
NOTIFY pgrst, 'reload schema';

COMMIT;
