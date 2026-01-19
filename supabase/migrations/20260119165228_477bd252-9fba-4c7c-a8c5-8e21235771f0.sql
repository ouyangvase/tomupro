-- Fix the reopen_rescheduled_orders function with correct runner_status enum values

CREATE OR REPLACE FUNCTION public.reopen_rescheduled_orders()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reopened_count int := 0;
  skipped_count int := 0;
  order_record record;
  result json;
BEGIN
  -- Find all orders scheduled for today or earlier that haven't been processed
  -- Only exclude DELIVERED status (terminal state)
  FOR order_record IN 
    SELECT 
      o.id,
      o.order_code,
      o.next_delivery_date,
      o.runner_id,
      o.reschedule_cycle_no,
      o.operational_status,
      o.status,
      o.runner_status,
      p.is_active as runner_is_active
    FROM orders o
    LEFT JOIN profiles p ON p.id = o.runner_id
    WHERE o.next_delivery_date <= CURRENT_DATE
      AND o.status = 'BOOKING'
      AND o.reschedule_flag = true
      AND o.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
      AND o.runner_status != 'DELIVERED'
      AND (o.cancelled_at IS NULL)
  LOOP
    -- Check if runner is still active
    IF order_record.runner_id IS NOT NULL AND order_record.runner_is_active = false THEN
      -- Runner is inactive, mark order for action required
      UPDATE orders
      SET 
        salesperson_action_required = true,
        salesperson_action_type = 'RUNNER_INACTIVE',
        last_status_note = 'Auto-reschedule blocked: assigned runner is no longer active'
      WHERE id = order_record.id;
      
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    -- Reopen the order: move to READY status
    -- Preserve TAKEN status if runner already accepted, otherwise set to ASSIGNED
    UPDATE orders
    SET 
      status = 'READY',
      operational_status = 'NEW',
      runner_status = CASE 
        WHEN runner_status = 'TAKEN' THEN 'TAKEN'
        WHEN runner_id IS NOT NULL THEN 'ASSIGNED'
        ELSE 'UNASSIGNED'
      END,
      reschedule_flag = false,
      reopened_at = NOW(),
      driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_failed_reason = NULL,
      driver_failed_remark = NULL,
      driver_next_delivery_date = NULL,
      last_status_note = 'Auto-reopened on scheduled date. Ready for delivery.'
    WHERE id = order_record.id;

    -- Record in reschedule history
    INSERT INTO reschedule_history (
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
      order_record.operational_status,
      'READY_AUTO_ASSIGNED',
      order_record.next_delivery_date,
      'System auto-reopened on scheduled date',
      NULL
    );

    reopened_count := reopened_count + 1;
  END LOOP;

  result := json_build_object(
    'success', true,
    'reopened_count', reopened_count,
    'skipped_count', skipped_count,
    'processed_at', NOW()
  );

  RETURN result;
END;
$$;