-- A Driver report awaiting Runner review is review work, not assignable work.
-- Keep it visible to the Driver/Runner review source, but remove it from the
-- current dispatch pool and repair the structured date from the attempt row.

CREATE OR REPLACE FUNCTION private.is_pending_driver_delivery_review(
  p_driver_status text,
  p_runner_accept_status text,
  p_runner_review_status text,
  p_salesperson_action_required boolean,
  p_runner_final_outcome text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT upper(COALESCE(p_driver_status, '')) IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
    AND upper(COALESCE(p_runner_accept_status, 'PENDING')) <> 'ACCEPTED'
    AND upper(COALESCE(p_runner_review_status, 'NOT_REVIEWED')) <> 'REVIEWED'
    AND COALESCE(p_salesperson_action_required, false) = false
    AND upper(COALESCE(p_runner_final_outcome, '')) <> 'NEED_SALESPERSON_FOLLOWUP'
$$;

-- READY + NEW is valid while a Driver report is waiting for Runner review.
-- Do not erase the structured Driver reschedule date in that state.
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
      NEW.driver_status::text = 'DRIVER_FAILED'
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

-- The Driver app stores the canonical reschedule date on delivery_attempts.
-- Older writes left orders.driver_next_delivery_date empty, so restore it
-- only for the latest pending attempt and never invent a date from free text.
WITH latest_attempt AS (
  SELECT DISTINCT ON (da.order_id)
    da.order_id,
    da.reschedule_date
  FROM public.delivery_attempts da
  WHERE da.superseded_at IS NULL
    AND da.reschedule_date IS NOT NULL
    AND da.result_type IN ('DRIVER_RESCHEDULE_SUBMITTED', 'DRIVER_DELIVERY_TOMORROW_SUBMITTED')
  ORDER BY da.order_id, da.submitted_at DESC, da.created_at DESC, da.id DESC
)
UPDATE public.orders o
SET driver_next_delivery_date = latest.reschedule_date,
    updated_at = now()
FROM latest_attempt latest
WHERE latest.order_id = o.id
  AND o.driver_status::text = 'DRIVER_FAILED'
  AND private.is_pending_driver_delivery_review(
    o.driver_status::text,
    o.runner_accept_status::text,
    o.runner_review_status::text,
    o.salesperson_action_required,
    o.runner_final_outcome::text
  )
  AND o.driver_next_delivery_date IS DISTINCT FROM latest.reschedule_date;

DO $$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  -- All three Runner dispatch read RPCs share the same due-date predicate.
  -- The regex tolerates formatting changes from pg_get_functiondef().
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_runner_dispatch_area_summary(date)'::regprocedure,
    'public.get_runner_dispatch_locality_summary(date,text)'::regprocedure,
    'public.get_runner_dispatch_area_order_ids(date,text,boolean)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;

    IF strpos(v_definition, 'private.is_pending_driver_delivery_review(') = 0 THEN
      v_rewritten := regexp_replace(
        v_definition,
        E'(private\\.is_runner_dispatch_date_due\\([^\\n]+\\)\\n[[:space:]]*)AND \\(',
        E'\\1AND private.is_pending_driver_delivery_review(o.driver_status::text, o.runner_accept_status::text, o.runner_review_status::text, o.salesperson_action_required, o.runner_final_outcome::text) = false'
          || chr(10) || '      AND (',
        'n'
      );

      IF v_rewritten = v_definition THEN
        RAISE EXCEPTION 'Runner dispatch pending-review boundary was not found in %', v_signature;
      END IF;

      EXECUTE v_rewritten;
    END IF;
  END LOOP;

  -- Reject stale UI selections at the write boundary as well.
  SELECT pg_get_functiondef('public.apply_driver_assignment_batch(uuid[],uuid,date,text)'::regprocedure)
    INTO v_definition;

  IF strpos(v_definition, 'private.is_pending_driver_delivery_review(') = 0 THEN
    v_rewritten := regexp_replace(
      v_definition,
      E'(o\\.current_operational_state = ''READY''\\n[[:space:]]*)FOR UPDATE',
      E'\\1AND private.is_pending_driver_delivery_review(o.driver_status::text, o.runner_accept_status::text, o.runner_review_status::text, o.salesperson_action_required, o.runner_final_outcome::text) = false'
        || chr(10) || '    FOR UPDATE',
      'n'
    );

    IF v_rewritten = v_definition THEN
      RAISE EXCEPTION 'Driver assignment pending-review write boundary was not found';
    END IF;

    EXECUTE v_rewritten;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
