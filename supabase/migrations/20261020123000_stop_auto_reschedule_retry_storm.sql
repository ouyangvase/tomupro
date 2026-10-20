-- Keep automatic rescheduling idempotent and bounded at the database boundary.
-- A stale Action Required marker can otherwise make a Booking row look
-- actionable. Repeating the RPC then rewrites the same order and appends a
-- new history row on every attempt.

CREATE INDEX IF NOT EXISTS idx_orders_due_rescheduled_booking
  ON public.orders (next_delivery_date, id)
  WHERE status = 'BOOKING'::public.order_status
    AND reschedule_flag = true
    AND cancelled_at IS NULL;

-- Repair rows left in READY by the previous non-idempotent path. The existing
-- READY consistency trigger chooses NEW/DELIVERED_FINAL/FAILED_FINAL from the
-- live runner and driver evidence; this update only removes the obsolete auto
-- reschedule marker and current date.
UPDATE public.orders
SET
  operational_status = CASE
    WHEN runner_status::text = 'DELIVERED'
      AND driver_status IS DISTINCT FROM 'DRIVER_FAILED' THEN 'DELIVERED_FINAL'
    WHEN runner_status::text = 'FAILED_DELIVERY'
      AND driver_status = 'DRIVER_FAILED' THEN 'FAILED_FINAL'
    ELSE 'NEW'
  END,
  reschedule_flag = false,
  next_delivery_date = NULL,
  updated_at = now()
WHERE status = 'READY'::public.order_status
  AND operational_status = 'BOOKING_AUTO_RESCHEDULE';

CREATE OR REPLACE FUNCTION private.clear_auto_reschedule_marker_on_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  -- BOOKING_AUTO_RESCHEDULE is the only state owned by the Sales auto-
  -- reschedule RPC. Once a lifecycle write leaves that state, the marker
  -- must not keep a stale order eligible for another scheduled pass.
  IF TG_OP = 'UPDATE'
    AND OLD.operational_status = 'BOOKING_AUTO_RESCHEDULE'
    AND (
      NEW.status::text <> 'BOOKING'
      OR NEW.operational_status IS DISTINCT FROM 'BOOKING_AUTO_RESCHEDULE'
    )
  THEN
    NEW.reschedule_flag := false;

    IF NEW.status::text = 'READY' THEN
      NEW.operational_status := 'NEW';
      NEW.next_delivery_date := NULL;
    ELSIF NEW.status::text = 'DELIVERED' THEN
      NEW.operational_status := 'DELIVERED_FINAL';
      NEW.next_delivery_date := NULL;
    ELSIF NEW.status::text = 'CANCELLED' THEN
      NEW.operational_status := 'CANCELLED';
      NEW.next_delivery_date := NULL;
    ELSIF NEW.operational_status IN ('DELIVERED_FINAL', 'CANCELLED', 'RETURNED', 'REFUNDED') THEN
      NEW.next_delivery_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.clear_auto_reschedule_marker_on_lifecycle_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS zz_clear_auto_reschedule_marker ON public.orders;
CREATE TRIGGER zz_clear_auto_reschedule_marker
BEFORE UPDATE OF status, operational_status, reschedule_flag, next_delivery_date
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.clear_auto_reschedule_marker_on_lifecycle_change();

CREATE OR REPLACE FUNCTION public.set_order_auto_reschedule(
  p_order_id uuid,
  p_next_delivery_date date,
  p_runner_id uuid DEFAULT NULL,
  p_comment text DEFAULT NULL,
  p_expected_state text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_from_state text;
  v_cycle_no integer;
  v_role text := public.get_user_role(auth.uid())::text;
  v_expected_state text := NULLIF(upper(trim(coalesce(p_expected_state, ''))), '');
  v_is_action_required boolean;
  v_is_auto_booking boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  IF p_next_delivery_date IS NULL THEN
    RAISE EXCEPTION 'A reschedule date is required' USING ERRCODE = '22023';
  END IF;

  IF p_next_delivery_date < (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date THEN
    RAISE EXCEPTION 'A reschedule date cannot be in the past' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id USING ERRCODE = 'P0002';
  END IF;

  IF v_role NOT IN ('admin', 'manager')
    AND v_order.salesperson_id IS DISTINCT FROM auth.uid()
    AND v_order.order_owner_id IS DISTINCT FROM auth.uid()
    AND v_order.runner_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'Not authorized to reschedule order %', p_order_id USING ERRCODE = '42501';
  END IF;

  v_from_state := v_order.current_operational_state;

  -- Action Required may be backed by READY or a Runner-created Booking
  -- reschedule. A Booking row already marked BOOKING_AUTO_RESCHEDULE is a
  -- separate valid path. A stale action marker on that auto state is not a
  -- second request and must be cancelled instead of retried.
  v_is_action_required := v_from_state = 'ACTION_REQUIRED'
    AND NOT (
      v_order.status::text = 'BOOKING'
      AND v_order.operational_status = 'BOOKING_AUTO_RESCHEDULE'
    );
  v_is_auto_booking := v_order.status::text = 'BOOKING'
    AND v_order.operational_status = 'BOOKING_AUTO_RESCHEDULE'
    AND COALESCE(v_order.reschedule_flag, false)
    AND v_order.next_delivery_date IS NOT NULL;

  IF NOT (v_is_action_required OR v_is_auto_booking) THEN
    -- Make an old request terminal. Do not throw an exception that a client
    -- or worker can immediately retry. Runner-created RESCHEDULED rows are
    -- left untouched because they follow a different review flow.
    UPDATE public.orders
    SET
      reschedule_flag = false,
      operational_status = CASE
        WHEN status::text = 'READY' THEN 'NEW'
        WHEN status::text = 'DELIVERED' THEN 'DELIVERED_FINAL'
        WHEN status::text = 'CANCELLED' THEN 'CANCELLED'
        ELSE operational_status
      END,
      next_delivery_date = NULL,
      updated_at = now()
    WHERE id = p_order_id
      AND (
        operational_status = 'BOOKING_AUTO_RESCHEDULE'
        OR status::text IN ('READY', 'DELIVERED', 'CANCELLED')
      );

    RETURN jsonb_build_object(
      'success', false,
      'changed', false,
      'auto_reschedule_cancelled', true,
      'order_id', p_order_id,
      'current_state', v_from_state,
      'message', 'Order is no longer eligible for auto-reschedule'
    );
  END IF;

  IF v_expected_state IS NOT NULL AND v_from_state IS DISTINCT FROM v_expected_state THEN
    -- Optimistic concurrency failures are terminal for this request. The
    -- caller can refresh the order, but should not retry the stale mutation.
    RETURN jsonb_build_object(
      'success', false,
      'changed', false,
      'stale', true,
      'order_id', p_order_id,
      'expected_state', v_expected_state,
      'current_state', v_from_state,
      'message', 'Order changed before auto-reschedule was applied'
    );
  END IF;

  -- Repeated delivery of the same request is a no-op. In particular, do not
  -- increment the cycle or write another history row for the same schedule.
  IF v_is_auto_booking
    AND v_order.next_delivery_date = p_next_delivery_date
    AND v_order.runner_id IS NOT DISTINCT FROM p_runner_id
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'changed', false,
      'idempotent', true,
      'order_id', p_order_id,
      'from_state', v_from_state,
      'to_state', 'BOOKING',
      'next_delivery_date', p_next_delivery_date,
      'cycle_no', v_order.reschedule_cycle_no
    );
  END IF;

  v_cycle_no := COALESCE(v_order.reschedule_cycle_no, 0) + 1;

  IF NOT v_is_auto_booking THEN
    PERFORM public.transition_order_lifecycle(
      p_order_id,
      'BOOKING',
      v_from_state,
      'RESCHEDULE_DELIVERY',
      p_next_delivery_date,
      false
    );
  END IF;

  UPDATE public.orders
  SET
    status = 'BOOKING'::order_status,
    expected_pickup_date = p_next_delivery_date,
    next_delivery_date = p_next_delivery_date,
    operational_status = 'BOOKING_AUTO_RESCHEDULE',
    reschedule_flag = true,
    reschedule_cycle_no = v_cycle_no,
    runner_id = p_runner_id,
    runner_status = CASE WHEN p_runner_id IS NULL THEN 'UNASSIGNED'::runner_status ELSE 'ASSIGNED'::runner_status END,
    runner_accept_status = NULL,
    runner_review_status = 'NOT_REVIEWED',
    runner_final_outcome = NULL,
    runner_failed_reason_id = NULL,
    runner_comment = NULL,
    runner_reviewed_at = NULL,
    runner_reviewed_by = NULL,
    driver_id = NULL,
    driver_status = 'UNASSIGNED',
    driver_assignment_batch_id = NULL,
    driver_assigned_at = NULL,
    driver_assigned_by = NULL,
    driver_started_at = NULL,
    driver_started_by = NULL,
    driver_delivered_at = NULL,
    driver_failed_reason = NULL,
    driver_failed_remark = NULL,
    driver_next_delivery_date = NULL,
    failed_reason = NULL,
    failed_remark = NULL,
    failed_next_step = NULL,
    delivered_at = NULL,
    salesperson_action_required = false,
    salesperson_action_type = NULL,
    salesperson_action_due_date = NULL,
    last_status_note = 'Auto-reschedule set for ' || p_next_delivery_date::text,
    updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.reschedule_history (
    order_id,
    cycle_no,
    from_status,
    to_status,
    next_delivery_date,
    comment,
    rescheduled_by
  ) VALUES (
    p_order_id,
    v_cycle_no,
    COALESCE(v_order.operational_status, v_order.status::text),
    'BOOKING_AUTO_RESCHEDULE',
    p_next_delivery_date,
    COALESCE(NULLIF(trim(p_comment), ''), 'Auto-reschedule confirmed'),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'order_id', p_order_id,
    'from_state', v_from_state,
    'to_state', 'BOOKING',
    'next_delivery_date', p_next_delivery_date,
    'cycle_no', v_cycle_no
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_auto_reschedule(uuid, date, uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_order_auto_reschedule(uuid, date, uuid, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
