-- Order writes must not depend on authenticated users having access to the
-- private schema. Keep this trigger SECURITY INVOKER and inline the small
-- review predicate it needs instead of calling a private helper.
CREATE OR REPLACE FUNCTION public.normalize_ready_reschedule_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
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
    IF NOT (
      NEW.driver_id IS NOT NULL
      AND NEW.driver_status::text = 'DRIVER_FAILED'
      AND upper(COALESCE(NEW.runner_accept_status::text, 'PENDING')) <> 'ACCEPTED'
      AND upper(COALESCE(NEW.runner_review_status::text, 'NOT_REVIEWED')) <> 'REVIEWED'
      AND COALESCE(NEW.salesperson_action_required, false) = false
      AND upper(COALESCE(NEW.runner_final_outcome::text, '')) <> 'NEED_SALESPERSON_FOLLOWUP'
    ) THEN
      NEW.driver_next_delivery_date := NULL;
    END IF;
  END IF;

  IF NEW.status::text = 'READY'
     AND (
       COALESCE(NEW.reschedule_flag, false)
       OR NEW.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
     ) THEN
    IF NEW.runner_status::text = 'DELIVERED' AND NEW.driver_status IS DISTINCT FROM 'DRIVER_FAILED' THEN
      NEW.operational_status := 'DELIVERED_FINAL';
      NEW.reschedule_flag := false;
      NEW.next_delivery_date := NULL;
      NEW.driver_next_delivery_date := NULL;
    ELSIF NEW.runner_status::text = 'FAILED_DELIVERY' AND NEW.driver_status = 'DRIVER_FAILED' THEN
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
$function$;

REVOKE ALL ON FUNCTION public.normalize_ready_reschedule_consistency()
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
