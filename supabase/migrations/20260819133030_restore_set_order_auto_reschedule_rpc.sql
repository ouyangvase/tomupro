-- Restore the Booking Sales auto-reschedule RPC only.
--
-- This is intentionally limited to the missing RPC. The existing
-- reopen_rescheduled_orders() function already moves due orders to READY and
-- keeps the selected runner (or resolves an active binding), so this
-- migration does not alter that function, cron jobs, or other lifecycle RPCs.

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
  IF NULLIF(upper(trim(coalesce(p_expected_state, ''))), '') IS NOT NULL
    AND v_from_state IS DISTINCT FROM upper(trim(p_expected_state))
  THEN
    RAISE EXCEPTION 'Stale lifecycle state for order %: expected %, found %',
      p_order_id, upper(trim(p_expected_state)), v_from_state USING ERRCODE = '40001';
  END IF;

  IF v_from_state IN ('DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Final order % cannot be auto-rescheduled', p_order_id USING ERRCODE = '22023';
  END IF;

  v_cycle_no := COALESCE(v_order.reschedule_cycle_no, 0) + 1;

  PERFORM public.transition_order_lifecycle(
    p_order_id,
    'BOOKING',
    v_from_state,
    'RESCHEDULE_DELIVERY',
    p_next_delivery_date,
    false
  );

  UPDATE public.orders
  SET
    status = 'BOOKING'::order_status,
    expected_pickup_date = p_next_delivery_date,
    next_delivery_date = p_next_delivery_date,
    operational_status = 'BOOKING_AUTO_RESCHEDULE',
    reschedule_flag = true,
    reschedule_cycle_no = v_cycle_no,
    runner_id = p_runner_id,
    runner_status = CASE WHEN p_runner_id IS NULL THEN 'UNASSIGNED' ELSE 'ASSIGNED' END,
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
