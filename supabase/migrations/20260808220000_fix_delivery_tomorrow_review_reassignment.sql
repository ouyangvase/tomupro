-- Delivery Tomorrow is a next-day dispatch outcome, not an active Driver outcome.
-- Keep the existing review paths intact, but release the current Driver so the
-- order can be selected from tomorrow's Runner Dispatch queue.

CREATE OR REPLACE FUNCTION public.review_driver_delivery(
  p_order_id uuid,
  p_actor_id uuid,
  p_accept boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_action text;
  v_normalized_reason text;
  v_requested_date date;
  v_submission_date date;
  v_is_next_day boolean := false;
  v_is_future_reschedule boolean := false;
  v_previous_driver_id uuid;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid actor');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'driver_operations')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver Operations access required');
  END IF;

  IF v_order.driver_status NOT IN ('DRIVER_DELIVERED', 'DRIVER_FAILED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver report is not ready for review');
  END IF;

  IF COALESCE(v_order.runner_accept_status, 'PENDING') = 'ACCEPTED'
    OR COALESCE(v_order.runner_review_status, 'NOT_REVIEWED') = 'REVIEWED'
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver report has already been reviewed');
  END IF;

  IF NOT p_accept AND NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A rejection reason is required');
  END IF;

  v_normalized_reason := lower(
    regexp_replace(trim(COALESCE(v_order.driver_failed_reason, '')), '\s+', ' ', 'g')
  );
  v_submission_date := (
    COALESCE(v_order.driver_failed_at, v_order.updated_at, now()) AT TIME ZONE 'Asia/Brunei'
  )::date;
  v_requested_date := v_order.driver_next_delivery_date;

  IF v_order.driver_status = 'DRIVER_FAILED' THEN
    IF v_normalized_reason = 'delivery tomorrow' THEN
      v_is_next_day := true;
      v_requested_date := COALESCE(v_requested_date, v_submission_date + 1);
    ELSIF v_normalized_reason = 'customer requested reschedule' THEN
      IF v_requested_date IS NULL THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'A new delivery date is required for rescheduling'
        );
      END IF;

      IF v_requested_date <= v_submission_date THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'The new delivery date must be tomorrow or later'
        );
      END IF;

      v_is_next_day := v_requested_date = v_submission_date + 1;
      v_is_future_reschedule := v_requested_date > v_submission_date + 1;
    END IF;
  END IF;

  IF p_accept THEN
    IF v_order.driver_status = 'DRIVER_FAILED' AND v_is_next_day THEN
      v_previous_driver_id := v_order.driver_id;

      UPDATE public.orders
      SET status = 'READY',
          operational_status = 'NEW',
          next_delivery_date = v_requested_date,
          runner_status = CASE
            WHEN v_order.runner_status = 'TAKEN' THEN 'TAKEN'::public.runner_status
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
          runner_comment = COALESCE(p_reason, v_order.driver_failed_remark),
          runner_reviewed_at = now(),
          runner_reviewed_by = p_actor_id,
          salesperson_action_required = false,
          salesperson_action_type = NULL,
          salesperson_action_due_date = NULL,
          reschedule_flag = false,
          reschedule_cycle_no = COALESCE(v_order.reschedule_cycle_no, 0) + 1,
          driver_failed_reason = NULL,
          driver_failed_remark = NULL,
          driver_next_delivery_date = NULL,
          reopened_at = now(),
          last_status_note = 'Delivery deferred to '
            || to_char(v_requested_date, 'DD Mon YYYY')
            || '; current Driver released for reassignment.',
          updated_at = now()
      WHERE id = p_order_id;

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
        p_order_id,
        COALESCE(v_order.reschedule_cycle_no, 0) + 1,
        p_actor_id,
        COALESCE(v_order.operational_status, 'NEW'),
        'DELIVERY_TOMORROW',
        v_requested_date,
        COALESCE(v_order.driver_failed_remark, 'Deliver again tomorrow')
          || ' Previous Driver released; stock unchanged.'
      );

      v_action := 'DRIVER_DELIVERY_DEFERRED';
    ELSIF v_order.driver_status = 'DRIVER_FAILED' AND v_is_future_reschedule THEN
      UPDATE public.orders
      SET status = 'BOOKING',
          operational_status = 'RESCHEDULED',
          next_delivery_date = v_requested_date,
          runner_status = CASE
            WHEN v_order.runner_status = 'TAKEN' THEN 'TAKEN'::public.runner_status
            ELSE 'ASSIGNED'::public.runner_status
          END,
          driver_status = 'ASSIGNED',
          runner_accept_status = NULL,
          runner_review_status = 'REVIEWED',
          runner_final_outcome = 'RESCHEDULE',
          runner_comment = COALESCE(p_reason, v_order.driver_failed_remark),
          runner_reviewed_at = now(),
          runner_reviewed_by = p_actor_id,
          salesperson_action_required = false,
          salesperson_action_type = NULL,
          salesperson_action_due_date = NULL,
          reschedule_flag = true,
          reschedule_cycle_no = COALESCE(v_order.reschedule_cycle_no, 0) + 1,
          driver_failed_reason = NULL,
          driver_failed_remark = NULL,
          driver_next_delivery_date = NULL,
          last_status_note = 'Driver reschedule accepted for '
            || to_char(v_requested_date, 'DD Mon YYYY')
            || '.',
          updated_at = now()
      WHERE id = p_order_id;

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
        p_order_id,
        COALESCE(v_order.reschedule_cycle_no, 0) + 1,
        p_actor_id,
        COALESCE(v_order.operational_status, 'NEW'),
        'RESCHEDULED',
        v_requested_date,
        COALESCE(v_order.driver_failed_remark, 'Customer requested reschedule')
      );

      v_action := 'DRIVER_RESCHEDULE_ACCEPTED';
    ELSIF v_order.driver_status = 'DRIVER_FAILED' THEN
      UPDATE public.orders
      SET runner_accept_status = 'ACCEPTED',
          runner_status = 'FAILED_DELIVERY',
          updated_at = now()
      WHERE id = p_order_id;
      v_action := 'DRIVER_FAILURE_ACCEPTED';
    ELSE
      UPDATE public.orders
      SET runner_accept_status = 'ACCEPTED',
          runner_status = 'DELIVERED',
          delivered_at = now(),
          updated_at = now()
      WHERE id = p_order_id;

      IF COALESCE(v_order.driver_cash_amount, 0) > 0 THEN
        INSERT INTO public.cash_liabilities (
          runner_id,
          driver_id,
          order_id,
          order_code,
          customer_name,
          cash_amount,
          delivered_at,
          status
        )
        VALUES (
          v_order.runner_id,
          v_order.driver_id,
          v_order.id,
          v_order.order_code,
          v_order.customer_name,
          v_order.driver_cash_amount,
          now(),
          'OPEN'
        )
        ON CONFLICT (order_id) DO UPDATE
        SET runner_id = EXCLUDED.runner_id,
            driver_id = EXCLUDED.driver_id,
            order_code = EXCLUDED.order_code,
            customer_name = EXCLUDED.customer_name,
            cash_amount = EXCLUDED.cash_amount,
            delivered_at = EXCLUDED.delivered_at
        WHERE public.cash_liabilities.status = 'OPEN';
      END IF;

      v_action := 'DRIVER_DELIVERY_ACCEPTED';
    END IF;
  ELSE
    UPDATE public.orders
    SET runner_accept_status = 'REJECTED',
        runner_status = CASE
          WHEN v_order.runner_status = 'TAKEN' THEN 'TAKEN'::public.runner_status
          ELSE 'ASSIGNED'::public.runner_status
        END,
        delivered_at = NULL,
        driver_status = 'OUT_FOR_DELIVERY',
        driver_delivered_at = NULL,
        driver_failed_at = NULL,
        runner_review_status = 'NOT_REVIEWED',
        runner_final_outcome = NULL,
        runner_comment = NULL,
        runner_reviewed_at = NULL,
        runner_reviewed_by = NULL,
        driver_failed_remark = trim(p_reason),
        updated_at = now()
    WHERE id = p_order_id;
    v_action := 'DRIVER_REPORT_REJECTED';
  END IF;

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
    p_order_id,
    v_action,
    p_actor_id,
    jsonb_build_object(
      'runner_status', v_order.runner_status,
      'driver_status', v_order.driver_status,
      'driver_id', v_order.driver_id,
      'runner_accept_status', v_order.runner_accept_status,
      'driver_failed_reason', v_order.driver_failed_reason,
      'driver_next_delivery_date', v_order.driver_next_delivery_date
    ),
    jsonb_build_object(
      'runner_id', v_order.runner_id,
      'driver_id', CASE WHEN v_action = 'DRIVER_DELIVERY_DEFERRED' THEN NULL ELSE v_order.driver_id END,
      'previous_driver_id', v_previous_driver_id,
      'accepted', p_accept,
      'reason', p_reason,
      'next_delivery_date', v_requested_date,
      'stock_unchanged', v_action = 'DRIVER_DELIVERY_DEFERRED',
      'inventory_accepted', v_action = 'DRIVER_DELIVERY_ACCEPTED'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'runner_id', v_order.runner_id,
    'driver_id', CASE WHEN v_action = 'DRIVER_DELIVERY_DEFERRED' THEN NULL ELSE v_order.driver_id END,
    'previous_driver_id', v_previous_driver_id,
    'action', v_action,
    'next_delivery_date', v_requested_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
