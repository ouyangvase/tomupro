-- A future reschedule releases the current Driver. Keep RPC response and
-- audit payloads aligned with the new assignment state.

BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_before constant text := $before$CASE WHEN v_action = 'DRIVER_DELIVERY_DEFERRED' THEN NULL ELSE v_order.driver_id END$before$;
  v_after constant text := $after$CASE WHEN v_action IN ('DRIVER_DELIVERY_DEFERRED', 'DRIVER_RESCHEDULE_ACCEPTED')
        THEN NULL
      ELSE v_order.driver_id
  END$after$;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, 'DRIVER_RESCHEDULE_ACCEPTED') > 0
    AND strpos(v_definition, 'v_action IN (''DRIVER_DELIVERY_DEFERRED'', ''DRIVER_RESCHEDULE_ACCEPTED'')') > 0
  THEN
    RETURN;
  END IF;

  IF strpos(v_definition, v_before) = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery result driver identity no longer matches expected definition';
  END IF;

  EXECUTE replace(v_definition, v_before, v_after);
END;
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
