-- A reschedule is a Booking until its explicit delivery date is reached.
-- The previous Delivery Tomorrow trigger moved accepted runner reschedules to
-- READY immediately and only the dispatch read path knew about the date. That
-- allowed an unrelated order update to make a future Booking appear in Ready.

CREATE OR REPLACE FUNCTION private.enforce_delivery_tomorrow_canonical_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_is_delivery_tomorrow boolean;
  v_date_is_due boolean;
BEGIN
  v_is_delivery_tomorrow := private.is_delivery_tomorrow_route(
    NEW.id,
    NEW.status::text,
    NEW.runner_status::text,
    NEW.runner_final_outcome::text,
    NEW.runner_review_status::text,
    NEW.runner_comment
  );

  -- A missing date is not due. It must be scheduled explicitly before the
  -- system can reopen the order; this prevents an implicit "tomorrow" from
  -- entering today's Ready queue.
  v_date_is_due := NEW.next_delivery_date IS NOT NULL
    AND NEW.next_delivery_date <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;

  IF v_is_delivery_tomorrow AND v_date_is_due THEN
    NEW.status := 'READY'::public.order_status;
    NEW.operational_status := 'NEW';
    NEW.reschedule_flag := false;
    NEW.salesperson_action_required := false;
    NEW.salesperson_action_type := NULL;
    NEW.salesperson_action_due_date := NULL;
    NEW.runner_accept_status := NULL;
    NEW.runner_review_status := 'REVIEWED';
    NEW.runner_final_outcome := 'RESCHEDULE';
    NEW.runner_comment := 'Delivery Tomorrow';
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
    NEW.delivered_at := NULL;
    NEW.last_status_note := 'Delivery date reached; returned to Runner Dispatch.';
  ELSIF v_is_delivery_tomorrow THEN
    -- Keep the order in Booking and preserve the scheduled date. The only
    -- supported path out of this state is the due-date cron or an explicit
    -- user lifecycle conversion.
    NEW.status := 'BOOKING'::public.order_status;
    NEW.operational_status := 'RESCHEDULED';
    NEW.reschedule_flag := true;
    NEW.salesperson_action_required := false;
    NEW.salesperson_action_type := NULL;
    NEW.salesperson_action_due_date := NULL;
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
    NEW.delivered_at := NULL;
    NEW.last_status_note := CASE
      WHEN NEW.next_delivery_date IS NULL
        THEN 'Delivery deferred; waiting for an explicit scheduled date.'
      ELSE 'Delivery deferred to ' || to_char(NEW.next_delivery_date, 'DD Mon YYYY') || '.'
    END;
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

ALTER FUNCTION private.enforce_delivery_tomorrow_canonical_route()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION private.enforce_delivery_tomorrow_canonical_route()
  FROM PUBLIC, anon, authenticated;

-- Repair only future rows that were already pushed into Ready by the old
-- trigger. Final/delivered/cancelled orders are intentionally excluded.
WITH candidates AS (
  SELECT o.id, o.order_code, o.next_delivery_date
  FROM public.orders AS o
  WHERE o.status = 'READY'::public.order_status
    AND o.next_delivery_date IS NOT NULL
    AND o.next_delivery_date > (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    AND o.reschedule_flag = true
    AND o.runner_status::text NOT IN (
      'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'RETURNED', 'REFUNDED'
    )
    AND o.operational_status NOT IN ('DELIVERED_FINAL', 'FAILED_FINAL', 'CANCELLED', 'RETURNED', 'REFUNDED')
), repaired AS (
  UPDATE public.orders AS o
  SET status = 'BOOKING'::public.order_status,
      operational_status = 'RESCHEDULED',
      reschedule_flag = true,
      updated_at = now()
  FROM candidates AS c
  WHERE o.id = c.id
  RETURNING o.id, o.order_code, o.next_delivery_date
)
INSERT INTO public.audit_logs (
  entity_type,
  entity_id,
  action,
  actor_id,
  before_json,
  after_json
)
SELECT
  'order',
  r.id,
  'EARLY_READY_RESCHEDULE_REPAIRED',
  NULL,
  jsonb_build_object(
    'order_code', r.order_code,
    'status', 'READY',
    'next_delivery_date', r.next_delivery_date,
    'reschedule_flag', true
  ),
  jsonb_build_object(
    'order_code', r.order_code,
    'status', 'BOOKING',
    'operational_status', 'RESCHEDULED',
    'next_delivery_date', r.next_delivery_date,
    'reschedule_flag', true
  )
FROM repaired AS r;

NOTIFY pgrst, 'reload schema';
