-- Fix auto-reschedule to trigger at midnight Brunei time (00:00 local)
-- instead of midnight UTC (which is 8 AM Brunei).
--
-- Changes:
-- 1. Use Brunei timezone for CURRENT_DATE comparison
-- 2. Reschedule cron to run at 16:00 UTC (midnight Brunei) + every 2 hours as safety net

-- 1. Update the function to use Brunei timezone
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
  v_today date;
BEGIN
  -- Use Brunei timezone (UTC+8) for date comparison
  -- This ensures "March 30" means "March 30 00:00 Brunei time"
  v_today := (NOW() AT TIME ZONE 'Asia/Brunei')::date;

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
    WHERE o.next_delivery_date <= v_today
      AND o.status = 'BOOKING'
      AND o.reschedule_flag = true
      AND o.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
      AND o.runner_status != 'DELIVERED'::runner_status
      AND (o.cancelled_at IS NULL)
  LOOP
    -- Check if runner is still active
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

    -- Reopen the order: move to READY status
    UPDATE orders
    SET
      status = 'READY',
      operational_status = 'NEW',
      runner_status = CASE
        WHEN order_record.runner_status = 'TAKEN'::runner_status THEN 'TAKEN'::runner_status
        WHEN order_record.runner_id IS NOT NULL THEN 'ASSIGNED'::runner_status
        ELSE 'UNASSIGNED'::runner_status
      END,
      reschedule_flag = false,
      reopened_at = NOW(),
      driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_failed_reason = NULL,
      driver_failed_remark = NULL,
      driver_next_delivery_date = NULL,
      last_status_note = 'Auto-reopened at start of scheduled date (00:00). Ready for delivery.'
    WHERE id = order_record.id;

    -- Record in reschedule history
    INSERT INTO reschedule_history (
      order_id, cycle_no, from_status, to_status,
      next_delivery_date, comment, rescheduled_by
    ) VALUES (
      order_record.id,
      COALESCE(order_record.reschedule_cycle_no, 0) + 1,
      order_record.operational_status,
      'READY_AUTO_ASSIGNED',
      order_record.next_delivery_date,
      'System auto-reopened at start of scheduled date (00:00 Brunei)',
      NULL
    );

    reopened_count := reopened_count + 1;
  END LOOP;

  result := json_build_object(
    'success', true,
    'reopened_count', reopened_count,
    'skipped_count', skipped_count,
    'processed_at', NOW(),
    'local_date_used', v_today
  );

  RETURN result;
END;
$$;

-- 2. Reschedule the cron job:
--    Remove old hourly schedule
SELECT cron.unschedule('reopen-rescheduled-orders');

--    Primary run: 16:00 UTC = 00:00 Brunei (midnight local time)
SELECT cron.schedule(
  'reopen-rescheduled-orders',
  '0 16 * * *',
  'SELECT public.reopen_rescheduled_orders()'
);

--    Safety net: run again at 17:00 UTC (1 AM Brunei) to catch any missed
SELECT cron.schedule(
  'reopen-rescheduled-orders-catchup',
  '0 17 * * *',
  'SELECT public.reopen_rescheduled_orders()'
);
