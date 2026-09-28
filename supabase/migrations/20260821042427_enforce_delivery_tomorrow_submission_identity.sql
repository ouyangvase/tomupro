BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.submit_driver_delivery_result(uuid,text,text,numeric,text,text,date,uuid,jsonb,text)'::regprocedure;
  v_definition text;
  v_before constant text := $before$
    IF v_normalized_reason = 'delivery tomorrow' THEN
$before$;
  v_after constant text := $after$
    IF v_result_type = 'DRIVER_DELIVERY_TOMORROW_SUBMITTED'
      AND v_normalized_reason <> 'delivery tomorrow'
    THEN
      RAISE EXCEPTION 'Delivery Tomorrow result must use the Delivery Tomorrow reason';
    END IF;

    IF v_normalized_reason = 'delivery tomorrow' THEN
$after$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, 'Delivery Tomorrow result must use the Delivery Tomorrow reason') > 0 THEN
    RETURN;
  END IF;

  IF strpos(v_definition, v_before) = 0 THEN
    RAISE EXCEPTION
      'submit_driver_delivery_result reason classification block no longer matches expected definition';
  END IF;

  EXECUTE replace(v_definition, v_before, v_after);
END;
$migration$;

COMMENT ON FUNCTION public.submit_driver_delivery_result(
  uuid, text, text, numeric, text, text, date, uuid, jsonb, text
) IS
  'Submits Driver outcomes. Delivery Tomorrow uses a dedicated result type and reason; mismatched payloads are rejected.';

NOTIFY pgrst, 'reload schema';

COMMIT;
