-- Resolving an Action Required order changes its canonical lifecycle and
-- releases any active Driver assignment. These fields must change in the
-- same UPDATE as the lifecycle state so the dispatch guard never observes a
-- non-READY order with an active Driver between two client requests.
CREATE OR REPLACE FUNCTION public.transition_order_lifecycle(
  p_order_id uuid,
  p_to_state text,
  p_expected_state text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_next_delivery_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_from_state text;
  v_previous_state text;
  v_to_state text := upper(trim(coalesce(p_to_state, '')));
  v_expected_state text := NULLIF(upper(trim(coalesce(p_expected_state, ''))), '');
  v_role text := public.get_user_role(auth.uid())::text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  IF v_to_state NOT IN ('BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Unsupported lifecycle state: %', v_to_state USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Not authorized to transition order %', p_order_id USING ERRCODE = '42501';
  END IF;

  v_from_state := v_order.current_operational_state;
  v_previous_state := v_from_state;
  IF v_expected_state IS NOT NULL AND v_from_state IS DISTINCT FROM v_expected_state THEN
    RAISE EXCEPTION 'Stale lifecycle state for order %: expected %, found %',
      p_order_id, v_expected_state, v_from_state USING ERRCODE = '40001';
  END IF;

  IF v_from_state = v_to_state THEN
    RETURN jsonb_build_object(
      'success', true,
      'changed', false,
      'order_id', p_order_id,
      'from_state', v_from_state,
      'to_state', v_to_state,
      'updated_at', v_order.updated_at
    );
  END IF;

  IF v_from_state IN ('DELIVERED', 'CANCELLED')
    AND v_to_state NOT IN ('DELIVERED', 'CANCELLED')
  THEN
    RAISE EXCEPTION 'Final order % must be explicitly reopened before moving to %',
      p_order_id, v_to_state USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = CASE v_to_state
        WHEN 'BOOKING' THEN 'BOOKING'::order_status
        WHEN 'READY' THEN 'READY'::order_status
        WHEN 'CANCELLED' THEN 'CANCELLED'::order_status
        ELSE status
      END,
      operational_status = CASE v_to_state
        WHEN 'BOOKING' THEN CASE WHEN p_next_delivery_date IS NULL THEN 'NEW' ELSE 'RESCHEDULED' END
        WHEN 'READY' THEN 'NEW'
        WHEN 'CANCELLED' THEN 'CANCELLED'
        WHEN 'DELIVERED' THEN 'DELIVERED_FINAL'
        ELSE operational_status
      END,
      salesperson_action_required = CASE WHEN v_to_state = 'ACTION_REQUIRED' THEN true ELSE false END,
      salesperson_action_type = CASE WHEN v_to_state = 'ACTION_REQUIRED' THEN NULLIF(p_reason, '') ELSE NULL END,
      salesperson_action_due_date = CASE WHEN v_to_state = 'ACTION_REQUIRED' THEN p_next_delivery_date ELSE NULL END,
      next_delivery_date = CASE
        WHEN v_to_state = 'BOOKING' THEN p_next_delivery_date
        WHEN v_to_state IN ('READY', 'DELIVERED', 'CANCELLED') THEN NULL
        ELSE next_delivery_date
      END,
      runner_review_status = CASE WHEN v_to_state IN ('BOOKING', 'READY') THEN 'NOT_REVIEWED' ELSE runner_review_status END,
      runner_final_outcome = CASE WHEN v_to_state IN ('BOOKING', 'READY') THEN NULL ELSE runner_final_outcome END,
      driver_id = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_id
      END,
      driver_status = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN 'UNASSIGNED'
        ELSE driver_status
      END,
      driver_assignment_batch_id = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_assignment_batch_id
      END,
      driver_assigned_at = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_assigned_at
      END,
      driver_assigned_by = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_assigned_by
      END,
      driver_started_at = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_started_at
      END,
      driver_started_by = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_started_by
      END,
      driver_delivered_at = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_delivered_at
      END,
      driver_next_delivery_date = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_next_delivery_date
      END,
      updated_at = now()
  WHERE id = p_order_id;

  SELECT current_operational_state, updated_at
  INTO v_from_state, v_order.updated_at
  FROM public.orders
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'order_id', p_order_id,
    'from_state', v_previous_state,
    'to_state', v_from_state,
    'updated_at', v_order.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_order_lifecycle(uuid, text, text, text, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transition_order_lifecycle(uuid, text, text, text, date)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
