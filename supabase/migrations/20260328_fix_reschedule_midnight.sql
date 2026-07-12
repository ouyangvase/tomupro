-- Fix auto-reschedule to trigger at midnight Malaysia time (00:00 local)
-- and auto-assign runners from bindings table when no runner is set.
--
-- Changes (v3 — 2026-07-12):
-- 1. Remove operational_status filter — use reschedule_flag only (many orders
--    had operational_status='NEW' but reschedule_flag=true and were missed)
-- 2. Auto-assign runner from bindings table if runner_id IS NULL
-- 3. Add audit_logs and notifications
-- 4. Use Asia/Kuala_Lumpur timezone

CREATE OR REPLACE FUNCTION public.reopen_rescheduled_orders()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reopened_count int := 0;
  skipped_count int := 0;
  unassigned_count int := 0;
  auto_assigned_count int := 0;
  order_record record;
  result json;
  v_today date;
  v_bound_runner_id uuid;
  v_bound_runner_name text;
  v_final_runner_id uuid;
  v_final_runner_status runner_status;
  v_note text;
BEGIN
  -- Use Malaysia timezone (UTC+8) for date comparison
  v_today := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;

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
      p.is_active as runner_is_active,
      p.display_name as runner_name
    FROM orders o
    LEFT JOIN profiles p ON p.id = o.runner_id
    WHERE o.next_delivery_date <= v_today
      AND o.status = 'BOOKING'
      AND o.reschedule_flag = true
      AND o.runner_status != 'DELIVERED'::runner_status
      AND (o.cancelled_at IS NULL)
  LOOP
    -- Check if assigned runner is still active
    IF order_record.runner_id IS NOT NULL AND order_record.runner_is_active = false THEN
      UPDATE orders
      SET
        salesperson_action_required = true,
        salesperson_action_type = 'RUNNER_INACTIVE',
        last_status_note = 'Auto-reschedule blocked: assigned runner is no longer active'
      WHERE id = order_record.id;

      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    -- Determine runner assignment
    v_final_runner_id := order_record.runner_id;
    v_bound_runner_name := order_record.runner_name;

    -- If no runner assigned, try auto-assign from bindings
    IF v_final_runner_id IS NULL AND order_record.salesperson_id IS NOT NULL THEN
      SELECT b.runner_id, rp.display_name
      INTO v_bound_runner_id, v_bound_runner_name
      FROM bindings b
      JOIN profiles rp ON rp.id = b.runner_id AND rp.is_active = true
      WHERE b.salesperson_id = order_record.salesperson_id
        AND b.active = true
      ORDER BY b.created_at ASC
      LIMIT 1;

      IF v_bound_runner_id IS NOT NULL THEN
        v_final_runner_id := v_bound_runner_id;
        auto_assigned_count := auto_assigned_count + 1;
      END IF;
    END IF;

    -- Determine runner_status
    IF order_record.runner_status = 'TAKEN'::runner_status THEN
      v_final_runner_status := 'TAKEN'::runner_status;
    ELSIF v_final_runner_id IS NOT NULL THEN
      v_final_runner_status := 'ASSIGNED'::runner_status;
    ELSE
      v_final_runner_status := 'UNASSIGNED'::runner_status;
      unassigned_count := unassigned_count + 1;
    END IF;

    -- Build status note
    IF v_final_runner_id IS NOT NULL AND order_record.runner_id IS NULL THEN
      v_note := 'Auto-converted to Ready. Runner auto-assigned from binding: ' || COALESCE(v_bound_runner_name, 'Unknown');
    ELSIF v_final_runner_id IS NOT NULL THEN
      v_note := 'Auto-converted to Ready at start of scheduled date. Runner: ' || COALESCE(v_bound_runner_name, 'Unknown');
    ELSE
      v_note := 'Auto-converted to Ready. No runner binding found — awaiting manual assignment.';
    END IF;

    -- Update order: move to READY
    UPDATE orders
    SET
      status = 'READY',
      operational_status = 'NEW',
      runner_id = v_final_runner_id,
      runner_status = v_final_runner_status,
      reschedule_flag = false,
      reopened_at = NOW(),
      driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_failed_reason = NULL,
      driver_failed_remark = NULL,
      driver_next_delivery_date = NULL,
      salesperson_action_required = false,
      salesperson_action_type = NULL,
      last_status_note = v_note
    WHERE id = order_record.id;

    -- Record in reschedule history
    INSERT INTO reschedule_history (
      order_id, cycle_no, from_status, to_status,
      next_delivery_date, comment, rescheduled_by
    ) VALUES (
      order_record.id,
      COALESCE(order_record.reschedule_cycle_no, 0) + 1,
      COALESCE(order_record.operational_status, 'BOOKING'),
      'READY_AUTO_CONVERTED',
      order_record.next_delivery_date,
      'System auto-converted at start of scheduled date (00:00 Malaysia). ' || v_note,
      NULL
    );

    -- Audit log
    INSERT INTO audit_logs (
      entity_type, entity_id, action, actor_id,
      order_id, order_ref, action_type, action_description,
      assigned_runner_id, assigned_runner_name,
      previous_status, new_status,
      performed_by_name, performed_by_role,
      after_json
    ) VALUES (
      'order', order_record.id, 'status_changed', NULL,
      order_record.id, order_record.order_code, 'AUTO_CONVERT_READY',
      v_note,
      v_final_runner_id, v_bound_runner_name,
      'BOOKING', 'READY',
      'System (Auto-Reschedule)', 'system',
      jsonb_build_object(
        'status', 'READY',
        'from_status', 'BOOKING',
        'runner_id', v_final_runner_id,
        'runner_name', v_bound_runner_name,
        'runner_status', v_final_runner_status,
        'next_delivery_date', order_record.next_delivery_date,
        'auto_assigned', (order_record.runner_id IS NULL AND v_final_runner_id IS NOT NULL)
      )
    );

    -- Notification for runner (if assigned)
    IF v_final_runner_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id, title, message, type,
        reference_type, reference_id,
        recipient_role, entity_type,
        status_from, status_to, priority
      ) VALUES (
        v_final_runner_id,
        'New Ready Order: ' || order_record.order_code,
        'Order ' || order_record.order_code || ' has been auto-converted to Ready and assigned to you.',
        'ORDER_READY',
        'order', order_record.id,
        'runner', 'order',
        'BOOKING', 'READY', 'normal'
      );
    END IF;

    -- Notification for salesperson
    IF order_record.salesperson_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id, title, message, type,
        reference_type, reference_id,
        recipient_role, entity_type,
        status_from, status_to, priority
      ) VALUES (
        order_record.salesperson_id,
        'Order Auto-Converted: ' || order_record.order_code,
        'Order ' || order_record.order_code || ' has been auto-converted from Booking to Ready.'
          || CASE WHEN v_final_runner_id IS NOT NULL
             THEN ' Assigned to runner: ' || COALESCE(v_bound_runner_name, 'Unknown') || '.'
             ELSE ' No runner assigned — please assign manually.'
             END,
        'ORDER_READY',
        'order', order_record.id,
        'salesperson', 'order',
        'BOOKING', 'READY', 'normal'
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
    'processed_at', NOW(),
    'local_date_used', v_today
  );

  RETURN result;
END;
$$;

-- Cron schedule (unchanged — already set up in production):
-- Primary: 16:00 UTC = 00:00 Malaysia time (midnight local)
-- SELECT cron.schedule('reopen-rescheduled-orders', '0 16 * * *', 'SELECT public.reopen_rescheduled_orders()');
-- Safety net: 17:00 UTC = 01:00 Malaysia time
-- SELECT cron.schedule('reopen-rescheduled-orders-catchup', '0 17 * * *', 'SELECT public.reopen_rescheduled_orders()');
