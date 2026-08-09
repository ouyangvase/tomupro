-- Batch-only override for a Runner intentionally scheduling failed driver
-- submissions for tomorrow while releasing the current Driver assignment.
-- Normal Driver review remains owned by review_driver_delivery().

CREATE OR REPLACE FUNCTION public.schedule_driver_failed_orders_for_tomorrow(
  p_order_ids uuid[],
  p_actor_id uuid,
  p_driver_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_actor uuid := auth.uid();
  v_tomorrow date := ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date + 1);
  v_processed jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_previous_driver_id uuid;
BEGIN
  IF p_actor_id IS DISTINCT FROM v_actor THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid actor');
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No orders selected');
  END IF;

  FOR v_order_id IN
    SELECT DISTINCT selected_order_id
    FROM unnest(p_order_ids) AS selected(selected_order_id)
    WHERE selected_order_id IS NOT NULL
  LOOP
    v_reason := NULL;
    v_previous_driver_id := NULL;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_reason := 'Order not found';
    ELSIF v_order.runner_id IS DISTINCT FROM v_actor
      AND NOT public.has_runner_assistant_permission(v_actor, v_order.runner_id, 'driver_operations')
    THEN
      v_reason := 'Driver Operations access required';
    ELSIF p_driver_id IS NOT NULL AND v_order.driver_id IS DISTINCT FROM p_driver_id THEN
      v_reason := 'Order is no longer assigned to this Driver';
    ELSIF v_order.driver_status IS DISTINCT FROM 'DRIVER_FAILED' THEN
      v_reason := 'Driver failed report is no longer pending';
    ELSIF COALESCE(v_order.runner_accept_status::text, 'PENDING') = 'ACCEPTED'
      OR COALESCE(v_order.runner_review_status, 'NOT_REVIEWED') = 'REVIEWED'
    THEN
      v_reason := 'Driver report has already been reviewed';
    ELSE
      v_previous_driver_id := v_order.driver_id;

      UPDATE public.orders
      SET status = 'READY',
          operational_status = 'NEW',
          next_delivery_date = v_tomorrow,
          runner_status = CASE
            WHEN v_order.runner_status = 'TAKEN'::public.runner_status THEN 'TAKEN'::public.runner_status
            ELSE 'ASSIGNED'::public.runner_status
          END,
          driver_id = NULL,
          driver_status = 'UNASSIGNED',
          driver_assignment_batch_id = NULL,
          driver_assigned_at = NULL,
          driver_assigned_by = NULL,
          runner_accept_status = NULL,
          runner_review_status = 'REVIEWED',
          runner_final_outcome = 'RESCHEDULE',
          runner_comment = 'Scheduled for tomorrow by Runner; current Driver released.',
          runner_reviewed_at = now(),
          runner_reviewed_by = v_actor,
          salesperson_action_required = false,
          salesperson_action_type = NULL,
          salesperson_action_due_date = NULL,
          reschedule_flag = false,
          reschedule_cycle_no = COALESCE(v_order.reschedule_cycle_no, 0) + 1,
          driver_failed_reason = NULL,
          driver_failed_remark = NULL,
          driver_next_delivery_date = NULL,
          reopened_at = now(),
          last_status_note = 'Scheduled for '
            || to_char(v_tomorrow, 'DD Mon YYYY')
            || '; Driver released for reassignment.',
          updated_at = now()
      WHERE id = v_order.id;

      INSERT INTO public.reschedule_history (
        order_id,
        cycle_no,
        rescheduled_by,
        from_status,
        to_status,
        next_delivery_date,
        comment
      )
      VALUES (
        v_order.id,
        COALESCE(v_order.reschedule_cycle_no, 0) + 1,
        v_actor,
        COALESCE(v_order.operational_status, 'NEW'),
        'DELIVERY_TOMORROW_REASSIGN',
        v_tomorrow,
        'Batch scheduled for tomorrow; previous Driver released and stock remains with that Driver until returned or transferred.'
      );

      INSERT INTO public.audit_logs (
        entity_type,
        entity_id,
        action,
        actor_id,
        before_json,
        after_json
      )
      VALUES (
        'order',
        v_order.id,
        'DRIVER_BATCH_SCHEDULED_TOMORROW',
        v_actor,
        jsonb_build_object(
          'status', v_order.status,
          'runner_status', v_order.runner_status,
          'driver_id', v_order.driver_id,
          'driver_status', v_order.driver_status,
          'runner_review_status', v_order.runner_review_status,
          'driver_failed_reason', v_order.driver_failed_reason,
          'driver_next_delivery_date', v_order.driver_next_delivery_date
        ),
        jsonb_build_object(
          'status', 'READY',
          'runner_status', CASE WHEN v_order.runner_status = 'TAKEN'::public.runner_status THEN 'TAKEN' ELSE 'ASSIGNED' END,
          'driver_id', NULL,
          'driver_status', 'UNASSIGNED',
          'runner_review_status', 'REVIEWED',
          'runner_final_outcome', 'RESCHEDULE',
          'next_delivery_date', v_tomorrow,
          'stock_unchanged', true
        )
      );

      v_processed := v_processed || jsonb_build_array(jsonb_build_object(
        'order_id', v_order.id,
        'order_code', v_order.order_code,
        'previous_driver_id', v_previous_driver_id,
        'next_delivery_date', v_tomorrow
      ));
      CONTINUE;
    END IF;

    v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
      'order_id', v_order_id,
      'order_code', CASE WHEN v_order.id IS NULL THEN NULL ELSE v_order.order_code END,
      'reason', COALESCE(v_reason, 'Order could not be scheduled')
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'tomorrow', v_tomorrow,
    'processed', v_processed,
    'processed_count', jsonb_array_length(v_processed),
    'skipped', v_skipped,
    'skipped_count', jsonb_array_length(v_skipped),
    'stock_unchanged', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_driver_failed_orders_for_tomorrow(uuid[], uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_driver_failed_orders_for_tomorrow(uuid[], uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.schedule_driver_failed_orders_for_tomorrow(uuid[], uuid, uuid) IS
  'Batch-only Runner action: schedule pending Driver failures for tomorrow and release the current Driver without changing stock.';

NOTIFY pgrst, 'reload schema';
