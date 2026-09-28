-- A future delivery date is a Booking schedule, never today's Ready queue.
-- Keep the invariant in the database because Runner and Driver views have
-- multiple read paths and some legacy RPCs write orders directly.

CREATE OR REPLACE FUNCTION private.is_runner_dispatch_date_due(
  p_next_delivery_date date,
  p_expected_pickup_date date,
  p_order_date date,
  p_reference_date date DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT public.order_operational_date(
    p_next_delivery_date,
    p_expected_pickup_date,
    p_order_date
  ) IS NULL
  OR public.order_operational_date(
    p_next_delivery_date,
    p_expected_pickup_date,
    p_order_date
  ) <= COALESCE(p_reference_date, (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
$$;

-- Normalize direct writes such as READY + next_delivery_date = tomorrow.
-- The scheduled Runner assignment is retained, but it cannot enter the
-- current dispatch queue until reopen_rescheduled_orders runs on that date.
CREATE OR REPLACE FUNCTION private.enforce_final_order_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF upper(coalesce(NEW.status::text, '')) = 'CANCELLED'
    OR upper(coalesce(NEW.operational_status, '')) IN ('CANCELLED', 'RETURNED', 'REFUNDED')
    OR upper(coalesce(NEW.runner_status::text, '')) IN ('CANCELLED', 'RETURNED', 'REFUNDED', 'DELIVERED')
    OR upper(coalesce(NEW.operational_status, '')) = 'DELIVERED_FINAL'
  THEN
    NEW.salesperson_action_required := false;
    NEW.salesperson_action_type := NULL;
    NEW.salesperson_action_due_date := NULL;
    IF upper(coalesce(NEW.runner_status::text, '')) IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED')
      OR upper(coalesce(NEW.operational_status, '')) IN ('DELIVERED_FINAL', 'CANCELLED', 'RETURNED', 'REFUNDED')
    THEN
      NEW.runner_review_status := CASE
        WHEN upper(coalesce(NEW.runner_status::text, '')) = 'DELIVERED' THEN 'REVIEWED'
        ELSE NEW.runner_review_status
      END;
    END IF;
  END IF;

  -- A confirmed salesperson/manager reschedule starts a clean Booking cycle.
  -- Older clients wrote BOOKING while leaving the previous Runner result in
  -- the current row, which made the lifecycle look Action Required again.
  IF upper(coalesce(NEW.status::text, '')) = 'BOOKING'
    AND coalesce(NEW.salesperson_action_required, false) = false
    AND (
      upper(coalesce(NEW.runner_final_outcome::text, '')) IN ('RESCHEDULE', 'NEED_SALESPERSON_FOLLOWUP')
      OR upper(coalesce(NEW.runner_review_status::text, '')) = 'ACTION_REQUIRED'
    )
  THEN
    NEW.runner_accept_status := NULL;
    NEW.runner_review_status := 'NOT_REVIEWED';
    NEW.runner_final_outcome := NULL;
    NEW.runner_failed_reason_id := NULL;
    NEW.runner_comment := NULL;
    NEW.runner_reviewed_at := NULL;
    NEW.runner_reviewed_by := NULL;
    NEW.driver_id := NULL;
    NEW.driver_status := 'UNASSIGNED';
    NEW.driver_assignment_batch_id := NULL;
    NEW.driver_assigned_at := NULL;
    NEW.driver_assigned_by := NULL;
    NEW.driver_started_at := NULL;
    NEW.driver_started_by := NULL;
    NEW.driver_delivered_at := NULL;
    NEW.driver_failed_reason := NULL;
    NEW.driver_failed_remark := NULL;
    NEW.driver_next_delivery_date := NULL;
    NEW.failed_reason := NULL;
    NEW.failed_remark := NULL;
    NEW.failed_next_step := NULL;
    NEW.delivered_at := NULL;
  END IF;

  IF upper(coalesce(NEW.status::text, '')) = 'READY'
    AND NEW.next_delivery_date > (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    AND coalesce(NEW.salesperson_action_required, false) = false
    AND upper(coalesce(NEW.runner_status::text, '')) NOT IN (
      'FAILED_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'
    )
  THEN
    NEW.status := 'BOOKING'::order_status;
    NEW.operational_status := 'RESCHEDULED';
    NEW.reschedule_flag := true;
  END IF;

  NEW.current_operational_state := private.order_current_operational_state(
    NEW.status::text,
    NEW.operational_status,
    NEW.runner_status::text,
    NEW.runner_review_status,
    NEW.runner_final_outcome,
    NEW.salesperson_action_required
  );
  RETURN NEW;
END;
$$;

-- Correct future rows already written by the old READY-based paths. This is
-- intentionally limited to non-final orders without a pending salesperson
-- decision; failed reports remain in Action Required for review.
DO $$
DECLARE
  r public.orders%ROWTYPE;
BEGIN
  FOR r IN
    SELECT o.*
    FROM public.orders o
    WHERE upper(coalesce(o.status::text, '')) = 'READY'
      AND o.next_delivery_date > (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      AND coalesce(o.salesperson_action_required, false) = false
      AND upper(coalesce(o.runner_status::text, '')) NOT IN (
        'FAILED_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'
      )
    ORDER BY o.order_code
    FOR UPDATE
  LOOP
    UPDATE public.orders
    SET status = 'BOOKING',
        operational_status = 'RESCHEDULED',
        reschedule_flag = true,
        updated_at = now()
    WHERE id = r.id;

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
      r.id,
      'FUTURE_RESCHEDULE_READY_REPAIRED',
      NULL,
      jsonb_build_object(
        'status', r.status,
        'operational_status', r.operational_status,
        'next_delivery_date', r.next_delivery_date,
        'runner_status', r.runner_status
      ),
      jsonb_build_object(
        'status', 'BOOKING',
        'operational_status', 'RESCHEDULED',
        'next_delivery_date', r.next_delivery_date,
        'runner_status', r.runner_status,
        'reschedule_flag', true
      )
    );
  END LOOP;
END;
$$;

-- Recover future dates that were erased by the older READY-date cleanup.
-- Only restore rows that are still READY with no date and whose latest cleanup
-- audit contains a future date; any later order update makes the row ineligible.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT o.*,
           recovery.recovered_date,
           recovery.cleared_at
    FROM public.orders o
    JOIN LATERAL (
      SELECT NULLIF(a.before_json->>'next_delivery_date', '')::date AS recovered_date,
             a.created_at AS cleared_at
      FROM public.audit_logs a
      WHERE a.entity_type = 'order'
        AND a.entity_id = o.id
        AND a.action = 'nonbooking_ready_date_cleared'
        AND NULLIF(a.before_json->>'next_delivery_date', '') IS NOT NULL
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 1
    ) recovery ON true
    WHERE upper(coalesce(o.status::text, '')) = 'READY'
      AND o.next_delivery_date IS NULL
      AND o.driver_next_delivery_date IS NULL
      AND recovery.recovered_date > (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
      AND recovery.cleared_at >= coalesce(o.updated_at, '-infinity'::timestamptz)
      AND coalesce(o.salesperson_action_required, false) = false
      AND upper(coalesce(o.runner_status::text, '')) NOT IN (
        'FAILED_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'
      )
    ORDER BY o.order_code
    FOR UPDATE OF o
  LOOP
    UPDATE public.orders
    SET status = 'BOOKING',
        operational_status = 'RESCHEDULED',
        next_delivery_date = r.recovered_date,
        reschedule_flag = true,
        updated_at = now()
    WHERE id = r.id;

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
      r.id,
      'FUTURE_RESCHEDULE_DATE_RESTORED',
      NULL,
      jsonb_build_object(
        'status', r.status,
        'operational_status', r.operational_status,
        'next_delivery_date', NULL,
        'runner_status', r.runner_status,
        'source_cleanup_at', r.cleared_at
      ),
      jsonb_build_object(
        'status', 'BOOKING',
        'operational_status', 'RESCHEDULED',
        'next_delivery_date', r.recovered_date,
        'runner_status', r.runner_status,
        'reschedule_flag', true
      )
    );
  END LOOP;
END;
$$;

-- The old “tomorrow” RPCs must write the same state directly. The guarded
-- trigger remains defense-in-depth for older clients and manual updates.
DO $$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.schedule_driver_failed_orders_for_tomorrow(uuid[],uuid,uuid)'::regprocedure,
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    v_rewritten := replace(
      v_definition,
      E'SET status = ''READY'',\n          operational_status = ''NEW'',\n          next_delivery_date = ',
      E'SET status = ''BOOKING'',\n          operational_status = ''RESCHEDULED'',\n          next_delivery_date = '
    );
    v_rewritten := replace(v_rewritten, E'          reschedule_flag = false,', E'          reschedule_flag = true,');

    IF v_rewritten = v_definition
       AND strpos(v_definition, 'status = ''BOOKING''') = 0 THEN
      RAISE EXCEPTION 'Future reschedule branch was not found in %', v_signature;
    END IF;

    IF v_rewritten <> v_definition THEN
      EXECUTE v_rewritten;
    END IF;
  END LOOP;
END;
$$;

-- Keep date-scoped and active-queue Driver dispatch summaries aligned with the
-- same due-date boundary as the direct Runner order query.
DO $$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_runner_dispatch_area_summary(date)'::regprocedure,
    'public.get_runner_dispatch_locality_summary(date,text)'::regprocedure,
    'public.get_runner_dispatch_area_order_ids(date,text,boolean)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    v_rewritten := replace(
      v_definition,
      E'WHERE o.current_operational_state = ''READY''\n      AND (',
      E'WHERE o.current_operational_state = ''READY''\n      AND private.is_runner_dispatch_date_due(o.next_delivery_date, o.expected_pickup_date, o.order_date, p_operational_date)\n      AND ('
    );

    IF v_rewritten = v_definition
       AND strpos(v_definition, 'private.is_runner_dispatch_date_due') = 0 THEN
      RAISE EXCEPTION 'Runner dispatch date boundary was not found in %', v_signature;
    END IF;

    IF v_rewritten <> v_definition THEN
      EXECUTE v_rewritten;
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
