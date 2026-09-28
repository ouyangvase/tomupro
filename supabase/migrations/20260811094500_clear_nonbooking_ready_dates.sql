-- READY dispatch/final states do not carry a current next-delivery date.
-- Keep dates only for an active BOOKING/reschedule state or for manual-review
-- failure conflicts that still need a Runner decision.

CREATE OR REPLACE FUNCTION public.normalize_ready_reschedule_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'READY'
     AND NOT COALESCE(NEW.reschedule_flag, false)
     AND (
       NEW.operational_status IN ('DELIVERED_FINAL', 'FAILED_FINAL')
       OR (
         NEW.operational_status = 'NEW'
         AND COALESCE(NEW.runner_status::text, 'UNASSIGNED') IN ('ASSIGNED', 'TAKEN', 'UNASSIGNED')
       )
     ) THEN
    NEW.next_delivery_date := NULL;
    NEW.driver_next_delivery_date := NULL;
  END IF;

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

DROP TRIGGER IF EXISTS orders_guard_ready_reschedule_consistency ON public.orders;

CREATE TRIGGER orders_guard_ready_reschedule_consistency
BEFORE INSERT OR UPDATE OF status, operational_status, reschedule_flag, driver_id, driver_status, next_delivery_date, driver_next_delivery_date
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.normalize_ready_reschedule_consistency();

DO $$
DECLARE
  r public.orders%ROWTYPE;
  after_row public.orders%ROWTYPE;
BEGIN
  FOR r IN
    SELECT o.*
    FROM public.orders o
    WHERE o.status::text = 'READY'
      AND NOT COALESCE(o.reschedule_flag, false)
      AND (
        o.next_delivery_date IS NOT NULL
        OR o.driver_next_delivery_date IS NOT NULL
      )
      AND (
        o.operational_status IN ('DELIVERED_FINAL', 'FAILED_FINAL')
        OR (
          o.operational_status = 'NEW'
          AND COALESCE(o.runner_status::text, 'UNASSIGNED') IN ('ASSIGNED', 'TAKEN', 'UNASSIGNED')
        )
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
      'nonbooking_ready_date_cleared',
      NULL,
      r.id,
      r.order_code,
      'READY_NONBOOKING_DATE_CLEANUP',
      'Cleared current next-delivery dates from a READY dispatch/final order.',
      r.runner_id,
      r.operational_status,
      after_row.operational_status,
      'System (Consistency Repair)',
      'system',
      'Dates are retained only for active booking/reschedule or manual-review failure conflicts.',
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
