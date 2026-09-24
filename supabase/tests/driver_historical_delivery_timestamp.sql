-- Run after the migration, inside BEGIN/ROLLBACK. Uses the real submission RPC;
-- all attempts, cash projections and queued notifications must be rolled back.
BEGIN;

DO $test$
DECLARE
  v_order public.orders%ROWTYPE;
  v_result jsonb;
  v_retry jsonb;
  v_submission uuid := gen_random_uuid();
  v_definition text := pg_get_functiondef(
    'public.submit_driver_delivery_result(uuid,text,text,numeric,text,text,date,uuid,jsonb,text)'::regprocedure
  );
  v_guard text;
  v_case record;
  v_blocked boolean;
BEGIN
  SELECT * INTO STRICT v_order FROM public.orders WHERE order_code = 'ST0139' FOR UPDATE;
  IF v_order.current_operational_state <> 'READY'
    OR v_order.driver_status::text <> 'ASSIGNED'
    OR NOT (v_order.driver_assigned_at > v_order.delivered_at)
  THEN
    RAISE EXCEPTION 'Regression fixture no longer matches the reported active historical delivery';
  END IF;

  -- Exercise the deployed predicate itself, including null handling.
  v_guard := split_part(split_part(v_definition,
    '  IF COALESCE(v_order.status::text, '''') IN (', 2),
    '  THEN' || chr(10) || '    RAISE EXCEPTION ''This order is no longer actionable'';', 1);
  IF v_guard = '' OR v_guard = v_definition THEN
    RAISE EXCEPTION 'Could not extract the deployed terminal-state guard';
  END IF;
  v_guard := 'COALESCE(v_order.status::text, '''') IN (' || v_guard;
  FOR v_case IN
    SELECT * FROM (VALUES
      ('reopened historical delivery', '{}'::jsonb, false),
      ('cancelled', '{"status":"CANCELLED"}'::jsonb, true),
      ('runner delivered', '{"runner_status":"DELIVERED"}'::jsonb, true),
      ('failed final', '{"operational_status":"FAILED_FINAL"}'::jsonb, true),
      ('delivered final', '{"operational_status":"DELIVERED_FINAL"}'::jsonb, true),
      ('booking', '{"status":"BOOKING","current_operational_state":"BOOKING"}'::jsonb, true),
      ('no assignment date', '{"driver_assigned_at":null}'::jsonb, true),
      ('no canonical state', '{"current_operational_state":null}'::jsonb, true),
      ('pending delivered', '{"driver_status":"DRIVER_DELIVERED"}'::jsonb, true),
      ('current-cycle delivery', jsonb_build_object('delivered_at', v_order.driver_assigned_at), true),
      ('normal active order', '{"delivered_at":null}'::jsonb, false),
      ('pending failed correction', '{"driver_status":"DRIVER_FAILED"}'::jsonb, false)
    ) AS cases(label, changes, expected_blocked)
  LOOP
    EXECUTE 'SELECT ' || v_guard || ' FROM jsonb_populate_record(NULL::public.orders, $1) AS v_order'
      INTO v_blocked USING to_jsonb(v_order) || v_case.changes;
    IF v_blocked IS DISTINCT FROM v_case.expected_blocked THEN
      RAISE EXCEPTION 'Guard regression failed: %', v_case.label;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', v_order.driver_id::text, true);
  v_result := public.submit_driver_delivery_result(
    p_order_id => v_order.id, p_result_type => 'DRIVER_DELIVERED_SUBMITTED',
    p_payment_method => 'CASH', p_submission_id => v_submission
  );
  IF v_result->>'success' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Reopened delivery submission failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = v_order.id AND driver_status::text = 'DRIVER_DELIVERED'
      AND driver_cash_amount = v_order.total_amount
      AND runner_accept_status::text = 'PENDING'
      AND runner_review_status = 'NOT_REVIEWED'
  ) THEN
    RAISE EXCEPTION 'Cash or pending Runner review projection is incorrect';
  END IF;
  v_retry := public.submit_driver_delivery_result(
    p_order_id => v_order.id, p_result_type => 'DRIVER_DELIVERED_SUBMITTED',
    p_payment_method => 'CASH', p_submission_id => v_submission
  );
  IF v_retry->>'duplicate' IS DISTINCT FROM 'true'
    OR v_retry->>'attempt_id' IS DISTINCT FROM v_result->>'attempt_id'
    OR (SELECT count(*) FROM public.delivery_attempts WHERE idempotency_key = v_submission::text) <> 1
    OR (SELECT count(*) FROM public.telegram_event_queue WHERE delivery_attempt_id = (v_result->>'attempt_id')::uuid) <> 1
  THEN
    RAISE EXCEPTION 'Retry duplicated delivery evidence or notification';
  END IF;
END;
$test$;

SELECT 'PASS: 12 deployed guard cases, real CASH submission, pending review, idempotent retry and single queued event; rollback required' AS regression;

ROLLBACK;
