-- Legacy failed reports may carry the reschedule reason without a requested
-- date. Treat those rows as ordinary failed reports during Runner review;
-- only an explicitly supplied date enters the reschedule workflow.
DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_before constant text := $before$
    ELSIF v_normalized_reason = 'customer requested reschedule' THEN
      IF v_requested_date IS NULL THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'A new delivery date is required for rescheduling'
        );
      END IF;

      IF v_requested_date <= v_submission_date THEN
$before$;
  v_after constant text := $after$
    ELSIF v_normalized_reason = 'customer requested reschedule'
      AND v_requested_date IS NOT NULL
    THEN
      IF v_requested_date <= v_submission_date THEN
$after$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, v_before) > 0 THEN
    EXECUTE replace(v_definition, v_before, v_after);
  ELSIF strpos(v_definition, v_after) = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery reschedule validation no longer matches expected definition';
  END IF;
END;
$migration$;
