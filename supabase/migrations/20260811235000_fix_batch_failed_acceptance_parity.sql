BEGIN;

-- Keep the review decision tied to the immutable Driver attempt when one
-- exists. Older manually-created failed rows have no attempt; when those rows
-- also have no date, preserve the legacy ordinary-failed fallback instead of
-- treating the label alone as a reschedule request.
DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_declaration_before constant text := $before_declaration$
  v_requested_date date;
  v_submission_date date;
  v_is_next_day boolean := false;
$before_declaration$;
  v_declaration_after constant text := $after_declaration$
  v_requested_date date;
  v_submission_date date;
  v_attempt public.delivery_attempts%ROWTYPE;
  v_has_attempt boolean := false;
  v_is_next_day boolean := false;
$after_declaration$;
  v_source_before constant text := $before_source$
  v_normalized_reason := lower(
    regexp_replace(trim(COALESCE(v_order.driver_failed_reason, '')), '\s+', ' ', 'g')
  );
  v_submission_date := (
    COALESCE(v_order.driver_failed_at, v_order.updated_at, now()) AT TIME ZONE 'Asia/Brunei'
  )::date;
  v_requested_date := v_order.driver_next_delivery_date;
$before_source$;
  v_source_after constant text := $after_source$
  SELECT da.*
  INTO v_attempt
  FROM public.delivery_attempts AS da
  WHERE da.order_id = v_order.id
    AND da.driver_id = v_order.driver_id
    AND da.active_assignment_id = v_order.driver_assignment_batch_id
    AND da.superseded_at IS NULL
  ORDER BY da.submitted_at DESC, da.created_at DESC
  LIMIT 1;

  v_has_attempt := v_attempt.id IS NOT NULL;
  v_normalized_reason := lower(
    regexp_replace(
      trim(COALESCE(v_attempt.failure_reason, v_order.driver_failed_reason, '')),
      '\s+',
      ' ',
      'g'
    )
  );
  v_submission_date := (
    COALESCE(v_attempt.submitted_at, v_order.driver_failed_at, v_order.updated_at, now())
      AT TIME ZONE 'Asia/Brunei'
  )::date;
  v_requested_date := COALESCE(v_attempt.reschedule_date, v_order.driver_next_delivery_date);
$after_source$;
  v_reschedule_before constant text := $before_reschedule$
    ELSIF v_normalized_reason = 'customer requested reschedule' THEN
$before_reschedule$;
  v_reschedule_after constant text := $after_reschedule$
    ELSIF v_normalized_reason = 'customer requested reschedule'
      AND (v_requested_date IS NOT NULL OR v_has_attempt)
    THEN
$after_reschedule$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, v_declaration_after) > 0
    AND strpos(v_definition, v_source_after) > 0
    AND strpos(v_definition, v_reschedule_after) > 0
  THEN
    RETURN;
  END IF;

  IF strpos(v_definition, v_declaration_before) = 0 THEN
    RAISE EXCEPTION 'review_driver_delivery declaration no longer matches expected definition';
  END IF;
  IF strpos(v_definition, v_source_before) = 0 THEN
    RAISE EXCEPTION 'review_driver_delivery source fields no longer match expected definition';
  END IF;
  IF strpos(v_definition, v_reschedule_before) = 0 THEN
    RAISE EXCEPTION 'review_driver_delivery reschedule branch no longer matches expected definition';
  END IF;

  v_definition := replace(v_definition, v_declaration_before, v_declaration_after);
  v_definition := replace(v_definition, v_source_before, v_source_after);
  v_definition := replace(v_definition, v_reschedule_before, v_reschedule_after);
  EXECUTE v_definition;
END;
$migration$;

COMMIT;
