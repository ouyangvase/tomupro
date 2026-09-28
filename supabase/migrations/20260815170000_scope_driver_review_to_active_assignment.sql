-- A Driver outcome is review-blocking only while that Driver assignment is
-- still current. Once the assignment is released, the outcome remains in
-- history but must not block the Runner's next delivery cycle.

DO $$
DECLARE
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(
    'public.mark_order_delivered_fast(uuid,uuid)'::regprocedure
  ) INTO v_definition;

  v_rewritten := replace(
    v_definition,
    'SELECT id, runner_id, runner_status, driver_status, stock_deducted,',
    'SELECT id, runner_id, driver_id, runner_status, driver_status, stock_deducted,'
  );
  v_rewritten := replace(
    v_rewritten,
    'IF v_order.driver_status IN (''DRIVER_DELIVERED'', ''DRIVER_FAILED'') THEN',
    'IF v_order.driver_id IS NOT NULL
    AND v_order.driver_status IN (''DRIVER_DELIVERED'', ''DRIVER_FAILED'') THEN'
  );

  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'mark_order_delivered_fast active Driver review boundary was not found';
  END IF;

  EXECUTE v_rewritten;
END;
$$;

DO $$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  -- Pending Driver review must be excluded from assignment/dispatch only
  -- when a current Driver assignment still exists.
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_runner_dispatch_area_summary(date)'::regprocedure,
    'public.get_runner_dispatch_locality_summary(date,text)'::regprocedure,
    'public.get_runner_dispatch_area_order_ids(date,text,boolean)'::regprocedure,
    'public.apply_driver_assignment_batch(uuid[],uuid,date,text)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;

    v_rewritten := replace(
      v_definition,
      'AND private.is_pending_driver_delivery_review(o.driver_status::text, o.runner_accept_status::text, o.runner_review_status::text, o.salesperson_action_required, o.runner_final_outcome::text) = false',
      'AND (o.driver_id IS NULL OR private.is_pending_driver_delivery_review(o.driver_status::text, o.runner_accept_status::text, o.runner_review_status::text, o.salesperson_action_required, o.runner_final_outcome::text) = false)'
    );

    IF v_rewritten = v_definition THEN
      RAISE EXCEPTION 'Driver review assignment boundary was not found in %', v_signature;
    END IF;

    EXECUTE v_rewritten;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_ready_reschedule_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
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
      AND private.is_pending_driver_delivery_review(
        NEW.driver_status::text,
        NEW.runner_accept_status::text,
        NEW.runner_review_status::text,
        NEW.salesperson_action_required,
        NEW.runner_final_outcome::text
      )
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

NOTIFY pgrst, 'reload schema';
