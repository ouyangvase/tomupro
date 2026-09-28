BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_reason_before constant text := $before_reason$
    IF v_normalized_reason = 'delivery tomorrow' THEN
$before_reason$;
  v_reason_after constant text := $after_reason$
    IF v_attempt.result_type = 'DRIVER_DELIVERY_TOMORROW_SUBMITTED'
      OR v_normalized_reason = 'delivery tomorrow'
    THEN
$after_reason$;
  v_accept_before constant text := $before_accept$
    IF v_order.driver_status = 'DRIVER_FAILED'
      AND v_is_next_day
      AND v_normalized_reason = 'delivery tomorrow'
    THEN
$before_accept$;
  v_accept_after constant text := $after_accept$
    IF v_order.driver_status = 'DRIVER_FAILED'
      AND v_is_next_day
      AND (
        v_attempt.result_type = 'DRIVER_DELIVERY_TOMORROW_SUBMITTED'
        OR v_normalized_reason = 'delivery tomorrow'
      )
    THEN
$after_accept$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, 'v_attempt.result_type = ''DRIVER_DELIVERY_TOMORROW_SUBMITTED''') > 0 THEN
    RETURN;
  END IF;

  IF strpos(v_definition, v_reason_before) = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery Delivery Tomorrow classification block no longer matches expected definition';
  END IF;

  IF strpos(v_definition, v_accept_before) = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery Delivery Tomorrow acceptance block no longer matches expected definition';
  END IF;

  v_definition := replace(v_definition, v_reason_before, v_reason_after);
  v_definition := replace(v_definition, v_accept_before, v_accept_after);
  EXECUTE v_definition;
END;
$migration$;

COMMENT ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text) IS
  'Reviews Driver results. Exact Delivery Tomorrow reason or dedicated result type preserves the order lifecycle; every other accepted Driver failure or reschedule follows the existing action flow.';

NOTIFY pgrst, 'reload schema';

COMMIT;
