-- Keep the Driver's selected reason and written remark available after Runner
-- acceptance. The Action Required queue needs the original Driver report even
-- after the active Driver assignment is released.

BEGIN;

DO $migration$
DECLARE
  v_review_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_review_definition text;
  v_driver_fields_before constant text := $driver_fields_before$
          driver_failed_reason = NULL,
          driver_failed_remark = NULL,
          driver_next_delivery_date = NULL,
$driver_fields_before$;
  v_driver_fields_after constant text := $driver_fields_after$
          driver_failed_reason = COALESCE(v_order.driver_failed_reason, v_attempt.failure_reason),
          driver_failed_remark = COALESCE(v_order.driver_failed_remark, v_attempt.remark),
          driver_next_delivery_date = NULL,
$driver_fields_after$;
BEGIN
  SELECT pg_get_functiondef(v_review_signature)
  INTO v_review_definition;

  IF strpos(v_review_definition, v_driver_fields_before) = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery Driver failure fields are not in the expected clear form';
  END IF;

  v_review_definition := replace(
    v_review_definition,
    v_driver_fields_before,
    v_driver_fields_after
  );
  EXECUTE v_review_definition;
END;
$migration$;

-- Restore the immutable Driver report details for already accepted active
-- Action Required orders. The delivery_attempts row is the source of truth;
-- this only repopulates the order fields used by existing Action Queue reads.
WITH latest_accepted_attempt AS (
  SELECT DISTINCT ON (da.order_id)
    da.order_id,
    da.failure_reason,
    da.remark
  FROM public.delivery_attempts AS da
  WHERE da.runner_decision = 'ACCEPTED'
    AND da.superseded_at IS NULL
    AND da.result_type IN (
      'DRIVER_FAILED_SUBMITTED',
      'DRIVER_RESCHEDULE_SUBMITTED'
    )
  ORDER BY da.order_id, da.runner_decision_at DESC NULLS LAST, da.submitted_at DESC
)
UPDATE public.orders AS o
SET driver_failed_reason = COALESCE(
      NULLIF(trim(o.driver_failed_reason), ''),
      NULLIF(trim(a.failure_reason), '')
    ),
    driver_failed_remark = COALESCE(
      NULLIF(trim(o.driver_failed_remark), ''),
      NULLIF(trim(a.remark), '')
    ),
    updated_at = now()
FROM latest_accepted_attempt AS a
WHERE o.id = a.order_id
  AND o.current_operational_state = 'ACTION_REQUIRED'
  AND (
    NULLIF(trim(o.driver_failed_reason), '') IS NULL
    OR NULLIF(trim(o.driver_failed_remark), '') IS NULL
  );

COMMENT ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text) IS
  'Reviews Driver results and preserves the original Driver reason and remark for Action Required orders.';

NOTIFY pgrst, 'reload schema';

COMMIT;
