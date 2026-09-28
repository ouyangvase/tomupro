-- Defense in depth for legacy rows whose reschedule_flag was lost. A future
-- reschedule outcome is still a Booking, regardless of the older flag value.
CREATE OR REPLACE FUNCTION public.prevent_future_rescheduled_ready_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NEW.status::text = 'READY'
    AND NEW.next_delivery_date IS NOT NULL
    AND NEW.next_delivery_date > (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    AND COALESCE(NEW.salesperson_action_required, false) = false
    AND COALESCE(NEW.runner_status::text, 'UNASSIGNED') NOT IN (
      'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'RETURNED', 'REFUNDED'
    )
    AND (
      COALESCE(NEW.reschedule_flag, false)
      OR NEW.operational_status IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE')
      OR (
        upper(COALESCE(NEW.runner_final_outcome::text, '')) = 'RESCHEDULE'
        AND upper(COALESCE(NEW.runner_review_status::text, '')) = 'REVIEWED'
      )
    )
  THEN
    NEW.status := 'BOOKING'::public.order_status;
    NEW.operational_status := 'RESCHEDULED';
    NEW.reschedule_flag := true;
    NEW.current_operational_state := private.order_current_operational_state(
      NEW.status::text,
      NEW.operational_status,
      NEW.runner_status::text,
      NEW.runner_review_status,
      NEW.runner_final_outcome,
      NEW.salesperson_action_required
    );
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.prevent_future_rescheduled_ready_state()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION public.prevent_future_rescheduled_ready_state()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzz_prevent_future_rescheduled_ready_state ON public.orders;
CREATE TRIGGER zzz_prevent_future_rescheduled_ready_state
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_future_rescheduled_ready_state();

-- Repair the old rows that are provably future reschedules. The repair does
-- not alter payment, assignment, or delivery outcome data.
WITH candidates AS (
  SELECT o.id, o.order_code, o.next_delivery_date
  FROM public.orders AS o
  WHERE o.status = 'READY'::public.order_status
    AND o.next_delivery_date IS NOT NULL
    AND o.next_delivery_date > (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    AND COALESCE(o.salesperson_action_required, false) = false
    AND upper(COALESCE(o.runner_final_outcome::text, '')) = 'RESCHEDULE'
    AND upper(COALESCE(o.runner_review_status::text, '')) = 'REVIEWED'
    AND COALESCE(o.runner_status::text, 'UNASSIGNED') NOT IN (
      'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'RETURNED', 'REFUNDED'
    )
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
  'FUTURE_RESCHEDULED_READY_REPAIRED',
  NULL,
  jsonb_build_object(
    'order_code', r.order_code,
    'status', 'READY',
    'next_delivery_date', r.next_delivery_date
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
