-- A future Driver reschedule is a Salesperson Action Required order.
-- Release the current Driver in the same transaction so the lifecycle guard
-- never sees a non-READY order with an active Driver assignment.

BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_branch_before constant text := $before_branch$ELSIF v_order.driver_status = 'DRIVER_FAILED' AND v_is_future_reschedule THEN
      UPDATE public.orders
$before_branch$;
  v_branch_after constant text := $after_branch$ELSIF v_order.driver_status = 'DRIVER_FAILED' AND v_is_future_reschedule THEN
      v_previous_driver_id := v_order.driver_id;

      UPDATE public.orders
$after_branch$;
  v_status_before constant text := $before_status$driver_status = 'ASSIGNED',
          runner_accept_status = NULL,$before_status$;
  v_status_after constant text := $after_status$driver_id = NULL,
          driver_status = 'UNASSIGNED',
          driver_assignment_batch_id = NULL,
          driver_assigned_at = NULL,
          driver_assigned_by = NULL,
          driver_started_at = NULL,
          driver_started_by = NULL,
          runner_accept_status = NULL,$after_status$;
  v_note_before constant text := $before_note$last_status_note = 'Driver reschedule accepted for '
            || to_char(v_requested_date, 'DD Mon YYYY')
            || '.$before_note$;
  v_note_after constant text := $after_note$last_status_note = 'Driver reschedule accepted for '
            || to_char(v_requested_date, 'DD Mon YYYY')
            || '; current Driver released; awaiting Salesperson action.$after_note$;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, v_status_after) > 0
    AND strpos(v_definition, v_note_after) > 0
  THEN
    RETURN;
  END IF;

  IF strpos(v_definition, v_branch_before) = 0
    OR strpos(v_definition, v_status_before) = 0
    OR strpos(v_definition, v_note_before) = 0
  THEN
    RAISE EXCEPTION
      'review_driver_delivery future reschedule branch no longer matches expected definition';
  END IF;

  v_definition := replace(v_definition, v_branch_before, v_branch_after);
  v_definition := replace(v_definition, v_status_before, v_status_after);
  v_definition := replace(v_definition, v_note_before, v_note_after);
  EXECUTE v_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
