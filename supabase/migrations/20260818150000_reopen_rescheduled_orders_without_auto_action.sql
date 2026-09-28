-- Scheduled reopening is a system operation, not a salesperson decision.
-- It may move a due Booking to Ready, but it must never create Action
-- Required. Action Required is created only by an explicit Driver/Runner
-- result or a user resolution flow.

CREATE OR REPLACE FUNCTION public.reopen_rescheduled_orders()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reopened_count integer := 0;
  skipped_count integer := 0;
  unassigned_count integer := 0;
  auto_assigned_count integer := 0;
  order_record record;
  result json;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_bound_runner_id uuid;
  v_bound_runner_name text;
  v_final_runner_id uuid;
  v_final_runner_status runner_status;
  v_note text;
  v_runner_was_inactive boolean;
BEGIN
  -- Only cron/service-role execution is allowed. Human decisions use the
  -- explicit UI/RPC flows and must not call this maintenance function.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Scheduled reopen is not a user action' USING ERRCODE = '42501';
  END IF;

  FOR order_record IN
    SELECT
      o.id,
      o.order_code,
      o.next_delivery_date,
      o.runner_id,
      o.salesperson_id,
      o.reschedule_cycle_no,
      o.operational_status,
      o.status,
      o.runner_status,
      o.driver_status,
      p.is_active AS runner_is_active,
      p.display_name AS runner_name
    FROM public.orders AS o
    LEFT JOIN public.profiles AS p ON p.id = o.runner_id
    WHERE o.next_delivery_date <= v_today
      AND o.status = 'BOOKING'
      AND o.reschedule_flag = true
      AND o.runner_status <> 'DELIVERED'::runner_status
      AND o.cancelled_at IS NULL
    FOR UPDATE OF o
  LOOP
    -- A Driver result is current evidence until the Runner reviews it.
    IF COALESCE(order_record.driver_status::text, 'UNASSIGNED') IN ('DRIVER_DELIVERED', 'DRIVER_FAILED') THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    v_runner_was_inactive := order_record.runner_id IS NOT NULL
      AND order_record.runner_is_active = false;
    v_final_runner_id := CASE WHEN v_runner_was_inactive THEN NULL ELSE order_record.runner_id END;
    v_bound_runner_name := CASE WHEN v_runner_was_inactive THEN NULL ELSE order_record.runner_name END;

    -- Do not silently move an order to Action Required because an old runner
    -- was disabled. Keep the order deliverable and require a human to assign
    -- a replacement runner from Ready Orders.
    IF v_runner_was_inactive THEN
      v_note := 'Auto-converted to Ready; previous runner is inactive. Manual runner assignment required.';
      unassigned_count := unassigned_count + 1;
    ELSE
      -- If no runner was saved, use the first active salesperson binding.
      IF v_final_runner_id IS NULL AND order_record.salesperson_id IS NOT NULL THEN
        SELECT b.runner_id, rp.display_name
        INTO v_bound_runner_id, v_bound_runner_name
        FROM public.bindings AS b
        JOIN public.profiles AS rp
          ON rp.id = b.runner_id
         AND rp.is_active = true
        WHERE b.salesperson_id = order_record.salesperson_id
          AND b.active = true
        ORDER BY b.created_at ASC
        LIMIT 1;

        IF v_bound_runner_id IS NOT NULL THEN
          v_final_runner_id := v_bound_runner_id;
          auto_assigned_count := auto_assigned_count + 1;
        END IF;
      END IF;

      IF v_final_runner_id IS NOT NULL THEN
        v_note := 'Auto-converted to Ready at start of scheduled date. Runner: '
          || COALESCE(v_bound_runner_name, 'Unknown');
      ELSE
        v_note := 'Auto-converted to Ready. No runner binding found — awaiting manual assignment.';
        unassigned_count := unassigned_count + 1;
      END IF;
    END IF;

    IF order_record.runner_status = 'TAKEN'::runner_status
      AND v_final_runner_id IS NOT NULL
    THEN
      v_final_runner_status := 'TAKEN'::runner_status;
    ELSIF v_final_runner_id IS NOT NULL THEN
      v_final_runner_status := 'ASSIGNED'::runner_status;
    ELSE
      v_final_runner_status := 'UNASSIGNED'::runner_status;
    END IF;

    UPDATE public.orders
    SET
      status = 'READY'::order_status,
      operational_status = 'NEW',
      runner_id = v_final_runner_id,
      runner_status = v_final_runner_status,
      reschedule_flag = false,
      reopened_at = now(),
      driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_assignment_batch_id = NULL,
      driver_assigned_at = NULL,
      driver_assigned_by = NULL,
      driver_started_at = NULL,
      driver_started_by = NULL,
      driver_delivered_at = NULL,
      driver_failed_at = NULL,
      driver_failed_reason = NULL,
      driver_failed_remark = NULL,
      driver_next_delivery_date = NULL,
      runner_accept_status = NULL,
      runner_review_status = 'NOT_REVIEWED',
      runner_final_outcome = NULL,
      runner_failed_reason_id = NULL,
      runner_comment = NULL,
      runner_reviewed_at = NULL,
      runner_reviewed_by = NULL,
      failed_reason = NULL,
      failed_remark = NULL,
      failed_next_step = NULL,
      delivered_at = NULL,
      salesperson_action_required = false,
      salesperson_action_type = NULL,
      salesperson_action_due_date = NULL,
      last_status_note = v_note,
      updated_at = now()
    WHERE id = order_record.id;

    INSERT INTO public.reschedule_history (
      order_id,
      cycle_no,
      from_status,
      to_status,
      next_delivery_date,
      comment,
      rescheduled_by
    ) VALUES (
      order_record.id,
      COALESCE(order_record.reschedule_cycle_no, 0) + 1,
      COALESCE(order_record.operational_status, 'BOOKING'),
      'READY_AUTO_CONVERTED',
      order_record.next_delivery_date,
      'System auto-converted at start of scheduled date. ' || v_note,
      NULL
    );

    -- Use only the base audit_logs schema. This is a system event, not a
    -- fake user action.
    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      actor_id,
      before_json,
      after_json
    ) VALUES (
      'order',
      order_record.id,
      'AUTO_CONVERT_READY',
      NULL,
      jsonb_build_object(
        'order_code', order_record.order_code,
        'status', order_record.status,
        'operational_status', order_record.operational_status,
        'runner_id', order_record.runner_id,
        'runner_status', order_record.runner_status,
        'next_delivery_date', order_record.next_delivery_date
      ),
      jsonb_build_object(
        'status', 'READY',
        'operational_status', 'NEW',
        'runner_id', v_final_runner_id,
        'runner_status', v_final_runner_status,
        'salesperson_action_required', false,
        'manual_assignment_required', v_final_runner_id IS NULL,
        'note', v_note
      )
    );

    IF v_final_runner_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        reference_type,
        reference_id,
        recipient_role,
        entity_type,
        status_from,
        status_to,
        priority
      ) VALUES (
        v_final_runner_id,
        'New Ready Order: ' || order_record.order_code,
        'Order ' || order_record.order_code || ' has been auto-converted to Ready and assigned to you.',
        'ORDER_READY',
        'order',
        order_record.id,
        'runner',
        'order',
        'BOOKING',
        'READY',
        'normal'
      );
    END IF;

    IF order_record.salesperson_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        message,
        type,
        reference_type,
        reference_id,
        recipient_role,
        entity_type,
        status_from,
        status_to,
        priority
      ) VALUES (
        order_record.salesperson_id,
        'Order Auto-Converted: ' || order_record.order_code,
        'Order ' || order_record.order_code || ' has been auto-converted from Booking to Ready.'
          || CASE WHEN v_final_runner_id IS NULL
             THEN ' Manual runner assignment is required.'
             ELSE ' Assigned to runner: ' || COALESCE(v_bound_runner_name, 'Unknown') || '.'
             END,
        'ORDER_READY',
        'order',
        order_record.id,
        'salesperson',
        'order',
        'BOOKING',
        'READY',
        'normal'
      );
    END IF;

    reopened_count := reopened_count + 1;
  END LOOP;

  result := json_build_object(
    'success', true,
    'reopened_count', reopened_count,
    'skipped_count', skipped_count,
    'auto_assigned_count', auto_assigned_count,
    'unassigned_count', unassigned_count,
    'processed_at', now(),
    'local_date_used', v_today
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_rescheduled_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_rescheduled_orders() TO service_role;

-- Repair due reschedules only after the safe implementation is installed.
SELECT public.reopen_rescheduled_orders();

NOTIFY pgrst, 'reload schema';
