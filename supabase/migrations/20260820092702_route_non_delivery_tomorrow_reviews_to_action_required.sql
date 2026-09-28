-- Runner acceptance rule:
--   * Exact Driver reason "Delivery Tomorrow" is acknowledgement-only and
--     preserves the current order lifecycle state.
--   * Every other accepted Driver failure/reschedule requires Salesperson
--     action.  Keep the existing Booking/Ready fields for those flows, but
--     make the Action Required marker canonical so current_operational_state
--     cannot fall back to Booking or Ready.

BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_next_day_before constant text := $before_next_day$
          runner_review_status = 'REVIEWED',
          runner_final_outcome = 'RESCHEDULE',
          runner_comment = 'Delivery Tomorrow',
          runner_reviewed_at = now(),
          runner_reviewed_by = p_actor_id,
          salesperson_action_required = false,
          salesperson_action_type = NULL,
          salesperson_action_due_date = NULL,
          reschedule_flag = false,
$before_next_day$;
  v_next_day_after constant text := $after_next_day$
          runner_review_status = 'REVIEWED',
          runner_final_outcome = 'RESCHEDULE',
          runner_comment = COALESCE(v_order.driver_failed_remark, 'Customer requested reschedule'),
          runner_reviewed_at = now(),
          runner_reviewed_by = p_actor_id,
          salesperson_action_required = true,
          salesperson_action_type = 'RESCHEDULE_DELIVERY',
          salesperson_action_due_date = v_requested_date,
          reschedule_flag = false,
$after_next_day$;
  v_failure_before constant text := $before_failure$
          runner_status = 'FAILED_DELIVERY',
          updated_at = now()
$before_failure$;
  v_failure_after constant text := $after_failure$
          runner_status = 'FAILED_DELIVERY',
          salesperson_action_required = true,
          salesperson_action_type = 'FOLLOWUP_CUSTOMER',
          salesperson_action_due_date = NULL,
          updated_at = now()
$after_failure$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, 'DRIVER_DELIVERY_TOMORROW_ACCEPTED') = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery Delivery Tomorrow branch is missing';
  END IF;

  IF strpos(v_definition, v_next_day_before) > 0 THEN
    v_definition := replace(v_definition, v_next_day_before, v_next_day_after);
  ELSIF strpos(v_definition, v_next_day_after) = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery next-day non-Delivery-Tomorrow branch is not recognized';
  END IF;

  IF strpos(v_definition, v_failure_before) > 0 THEN
    v_definition := replace(v_definition, v_failure_before, v_failure_after);
  ELSIF strpos(v_definition, v_failure_after) = 0 THEN
    RAISE EXCEPTION
      'review_driver_delivery generic failed acceptance branch is not recognized';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

-- Repair active orders that were already accepted through a non-special
-- Driver result before this rule was installed. This only adds the canonical
-- Salesperson action marker; it does not change stock, cash, driver history,
-- delivery attempts, or final orders.
WITH latest_accepted_attempt AS (
  SELECT DISTINCT ON (da.order_id)
    da.order_id,
    da.result_type,
    da.failure_reason,
    da.remark,
    da.reschedule_date
  FROM public.delivery_attempts AS da
  WHERE da.runner_decision = 'ACCEPTED'
    AND da.superseded_at IS NULL
  ORDER BY da.order_id, da.runner_decision_at DESC NULLS LAST, da.submitted_at DESC
),
eligible AS (
  SELECT o.id,
         a.result_type,
         a.failure_reason,
         a.remark,
         a.reschedule_date
  FROM public.orders AS o
  JOIN latest_accepted_attempt AS a ON a.order_id = o.id
  WHERE o.current_operational_state NOT IN ('DELIVERED', 'CANCELLED')
    AND a.result_type <> 'DRIVER_DELIVERY_TOMORROW_SUBMITTED'
    AND o.driver_id IS NULL
    AND o.driver_assignment_batch_id IS NULL
    AND o.salesperson_action_required IS DISTINCT FROM true
)
UPDATE public.orders AS o
SET salesperson_action_required = true,
    salesperson_action_type = CASE
      WHEN e.reschedule_date IS NOT NULL
        OR e.result_type = 'DRIVER_RESCHEDULE_SUBMITTED'
        THEN 'RESCHEDULE_DELIVERY'
      ELSE 'FOLLOWUP_CUSTOMER'
    END,
    salesperson_action_due_date = e.reschedule_date,
    runner_comment = COALESCE(o.runner_comment, NULLIF(e.remark, ''), e.failure_reason),
    updated_at = now()
FROM eligible AS e
WHERE o.id = e.id;

COMMENT ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text) IS
  'Reviews Driver results. Exact Delivery Tomorrow acceptance preserves the order lifecycle; every other accepted Driver failure or reschedule becomes Action Required.';

NOTIFY pgrst, 'reload schema';

COMMIT;
