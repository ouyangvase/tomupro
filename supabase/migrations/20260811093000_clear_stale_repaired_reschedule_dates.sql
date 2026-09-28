-- A repaired READY/final order must not retain a current next-delivery date.
-- The original reschedule is already preserved in reschedule_history.

CREATE OR REPLACE FUNCTION public.normalize_ready_reschedule_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'READY'
     AND (
       COALESCE(NEW.reschedule_flag, false)
       OR NEW.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
     ) THEN
    IF NEW.runner_status::text = 'DELIVERED'
       AND NEW.driver_status IS DISTINCT FROM 'DRIVER_FAILED' THEN
      NEW.operational_status := 'DELIVERED_FINAL';
      NEW.reschedule_flag := false;
      NEW.next_delivery_date := NULL;
      NEW.driver_next_delivery_date := NULL;
    ELSIF NEW.runner_status::text = 'FAILED_DELIVERY'
       AND NEW.driver_status = 'DRIVER_FAILED' THEN
      NEW.operational_status := 'FAILED_FINAL';
      NEW.reschedule_flag := false;
      NEW.next_delivery_date := NULL;
      NEW.driver_next_delivery_date := NULL;
    ELSIF COALESCE(NEW.runner_status::text, 'UNASSIGNED') NOT IN ('DELIVERED', 'FAILED_DELIVERY')
       AND NEW.driver_status IS DISTINCT FROM 'DRIVER_DELIVERED'
       AND NEW.driver_status IS DISTINCT FROM 'DRIVER_FAILED'
       AND (
         NEW.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
         OR NEW.driver_id IS NOT NULL
       ) THEN
      NEW.operational_status := 'NEW';
      NEW.reschedule_flag := false;
      NEW.next_delivery_date := NULL;
      NEW.driver_next_delivery_date := NULL;
      NEW.driver_id := NULL;
      NEW.driver_status := 'UNASSIGNED';
      NEW.driver_failed_reason := NULL;
      NEW.driver_failed_remark := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r public.orders%ROWTYPE;
  after_row public.orders%ROWTYPE;
BEGIN
  FOR r IN
    SELECT o.*
    FROM public.orders o
    WHERE o.status::text = 'READY'
      AND (
        o.next_delivery_date IS NOT NULL
        OR o.driver_next_delivery_date IS NOT NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.audit_logs a
        WHERE a.order_id = o.id
          AND a.action_type = 'READY_RESCHEDULE_CONSISTENCY_REPAIR'
          AND a.before_json->>'reschedule_flag' = 'true'
      )
    ORDER BY o.order_code
    FOR UPDATE
  LOOP
    UPDATE public.orders
    SET next_delivery_date = NULL,
        driver_next_delivery_date = NULL
    WHERE id = r.id
    RETURNING * INTO after_row;

    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      actor_id,
      order_id,
      order_ref,
      action_type,
      action_description,
      assigned_runner_id,
      previous_status,
      new_status,
      performed_by_name,
      performed_by_role,
      remarks,
      before_json,
      after_json
    )
    VALUES (
      'order',
      r.id,
      'stale_reschedule_date_cleared',
      NULL,
      r.id,
      r.order_code,
      'READY_RESCHEDULE_DATE_CLEANUP',
      'Cleared an obsolete next-delivery date after READY/reschedule consistency repair.',
      r.runner_id,
      r.operational_status,
      after_row.operational_status,
      'System (Consistency Repair)',
      'system',
      'The original reschedule remains in reschedule_history; no order history was deleted.',
      jsonb_build_object(
        'next_delivery_date', r.next_delivery_date,
        'driver_next_delivery_date', r.driver_next_delivery_date
      ),
      jsonb_build_object(
        'next_delivery_date', after_row.next_delivery_date,
        'driver_next_delivery_date', after_row.driver_next_delivery_date
      )
    );
  END LOOP;
END;
$$;
