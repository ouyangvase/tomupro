BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.submit_driver_delivery_result(uuid,text,text,numeric,text,text,date,uuid,jsonb,text)'::regprocedure;
  v_definition text;
  v_marker text := '  INSERT INTO public.delivery_attempts (' || chr(10);
  v_replacement text :=
    '  IF v_submission_mode = ''CORRECTION'' THEN' || chr(10)
    || '    UPDATE public.delivery_attempts' || chr(10)
    || '    SET runner_decision = ''SUPERSEDED'',' || chr(10)
    || '        superseded_at = v_submitted_at' || chr(10)
    || '    WHERE order_id = v_order.id' || chr(10)
    || '      AND driver_id = v_actor_id' || chr(10)
    || '      AND active_assignment_id = v_assignment.id' || chr(10)
    || '      AND runner_decision = ''PENDING''' || chr(10)
    || '      AND superseded_at IS NULL;' || chr(10)
    || '  END IF;' || chr(10) || chr(10)
    || v_marker;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'submit_driver_delivery_result function was not found';
  END IF;

  IF strpos(v_definition, v_marker) = 0 THEN
    RAISE EXCEPTION 'submit_driver_delivery_result insert boundary was not found';
  END IF;

  IF strpos(v_definition, 'runner_decision = ''SUPERSEDED''') > 0 THEN
    RETURN;
  END IF;

  EXECUTE replace(v_definition, v_marker, v_replacement);
END;
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
