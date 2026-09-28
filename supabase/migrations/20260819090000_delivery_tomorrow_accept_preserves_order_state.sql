-- Delivery Tomorrow is an acknowledgement-only Runner review.
--
-- The Driver submission already stores the requested next-day date in
-- driver_next_delivery_date. Accepting that exact reason must not move the
-- order between lifecycle queues, release its Driver, clear the remark, or
-- create a reschedule history row. Other Driver failure reasons keep the
-- existing review transitions.

BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_branch_before constant text := $before_branch$
  IF p_accept THEN
    IF v_order.driver_status = 'DRIVER_FAILED' AND v_is_next_day THEN
$before_branch$;
  v_branch_after constant text := $after_branch$
  IF p_accept THEN
    IF v_order.driver_status = 'DRIVER_FAILED'
      AND v_is_next_day
      AND v_normalized_reason = 'delivery tomorrow'
    THEN
      UPDATE public.orders
      SET runner_accept_status = 'ACCEPTED',
          runner_review_status = 'REVIEWED',
          runner_reviewed_at = now(),
          runner_reviewed_by = p_actor_id,
          updated_at = now()
      WHERE id = p_order_id;

      v_action := 'DRIVER_DELIVERY_TOMORROW_ACCEPTED';
    ELSIF v_order.driver_status = 'DRIVER_FAILED' AND v_is_next_day THEN
$after_branch$;
  v_audit_before constant text := $before_audit$
      'next_delivery_date', v_requested_date,
      'stock_unchanged', v_action = 'DRIVER_DELIVERY_DEFERRED',
      'inventory_accepted', v_action = 'DRIVER_DELIVERY_ACCEPTED'
$before_audit$;
  v_audit_after constant text := $after_audit$
      'next_delivery_date', CASE
        WHEN v_action = 'DRIVER_DELIVERY_TOMORROW_ACCEPTED'
          THEN v_order.next_delivery_date
        ELSE v_requested_date
      END,
      'driver_next_delivery_date', CASE
        WHEN v_action = 'DRIVER_DELIVERY_TOMORROW_ACCEPTED'
          THEN v_order.driver_next_delivery_date
        ELSE NULL
      END,
      'order_state_unchanged', v_action = 'DRIVER_DELIVERY_TOMORROW_ACCEPTED',
      'stock_unchanged', v_action IN (
        'DRIVER_DELIVERY_DEFERRED',
        'DRIVER_DELIVERY_TOMORROW_ACCEPTED'
      ),
      'inventory_accepted', v_action = 'DRIVER_DELIVERY_ACCEPTED'
$after_audit$;
  v_return_before constant text := $before_return$
    'action', v_action,
    'next_delivery_date', v_requested_date
$before_return$;
  v_return_after constant text := $after_return$
    'action', v_action,
    'next_delivery_date', CASE
      WHEN v_action = 'DRIVER_DELIVERY_TOMORROW_ACCEPTED'
        THEN v_order.next_delivery_date
      ELSE v_requested_date
    END,
    'driver_next_delivery_date', CASE
      WHEN v_action = 'DRIVER_DELIVERY_TOMORROW_ACCEPTED'
        THEN v_order.driver_next_delivery_date
      ELSE NULL
    END,
    'order_state_unchanged', v_action = 'DRIVER_DELIVERY_TOMORROW_ACCEPTED'
$after_return$;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF strpos(v_definition, 'DRIVER_DELIVERY_TOMORROW_ACCEPTED') > 0 THEN
    RETURN;
  END IF;

  IF strpos(v_definition, v_branch_before) = 0 THEN
    RAISE EXCEPTION 'review_driver_delivery accept branch no longer matches expected definition';
  END IF;
  IF strpos(v_definition, v_audit_before) = 0 THEN
    RAISE EXCEPTION 'review_driver_delivery audit payload no longer matches expected definition';
  END IF;
  IF strpos(v_definition, v_return_before) = 0 THEN
    RAISE EXCEPTION 'review_driver_delivery return payload no longer matches expected definition';
  END IF;

  v_definition := replace(v_definition, v_branch_before, v_branch_after);
  v_definition := replace(v_definition, v_audit_before, v_audit_after);
  v_definition := replace(v_definition, v_return_before, v_return_after);

  EXECUTE v_definition;
END;
$migration$;

COMMENT ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text) IS
  'Reviews Driver results. Exact Delivery Tomorrow acceptance only records Runner review and preserves the order lifecycle state; other results use the normal transitions.';

NOTIFY pgrst, 'reload schema';

COMMIT;
