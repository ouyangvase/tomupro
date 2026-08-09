-- Allow the assigned Driver or Runner to correct a pending failed-delivery
-- option. This is deliberately separate from review_driver_delivery: Reject
-- returns the report to the Driver, while this keeps the report pending and
-- changes only the selected failure details atomically.
CREATE OR REPLACE FUNCTION public.change_driver_failed_status(
  p_order_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_next_delivery_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reason text;
  v_normalized_reason text;
  v_next_delivery_date date;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid actor');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.driver_id IS DISTINCT FROM p_actor_id
    AND v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'driver_operations')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver Operations access required');
  END IF;

  IF v_order.driver_status IS DISTINCT FROM 'DRIVER_FAILED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only a failed delivery can be changed');
  END IF;

  IF COALESCE(v_order.runner_accept_status, 'PENDING') = 'ACCEPTED'
    OR COALESCE(v_order.runner_review_status, 'NOT_REVIEWED') = 'REVIEWED'
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'This failed delivery has already been reviewed');
  END IF;

  v_normalized_reason := lower(
    regexp_replace(trim(COALESCE(p_reason, '')), '\s+', ' ', 'g')
  );

  SELECT r.label INTO v_reason
  FROM public.reasons r
  WHERE r.reason_type = 'FAILED_DELIVERY'
    AND r.is_active = true
    AND lower(regexp_replace(trim(r.label), '\s+', ' ', 'g')) = v_normalized_reason
  ORDER BY r.sort_order, r.label
  LIMIT 1;

  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Select a valid failed-delivery option');
  END IF;

  IF v_normalized_reason = lower(regexp_replace('Delivery Tomorrow', '\s+', ' ', 'g')) THEN
    v_next_delivery_date := v_today + 1;
  ELSIF v_normalized_reason = lower(regexp_replace('Customer requested reschedule', '\s+', ' ', 'g')) THEN
    IF p_next_delivery_date IS NULL OR p_next_delivery_date <= v_today THEN
      RETURN jsonb_build_object('success', false, 'error', 'The new delivery date must be tomorrow or later');
    END IF;
    v_next_delivery_date := p_next_delivery_date;
  ELSE
    v_next_delivery_date := NULL;
  END IF;

  UPDATE public.orders
  SET driver_status = 'DRIVER_FAILED',
      driver_delivered_at = NULL,
      driver_failed_at = now(),
      driver_failed_reason = v_reason,
      driver_next_delivery_date = v_next_delivery_date,
      runner_status = CASE
        WHEN v_order.runner_status = 'TAKEN' THEN 'TAKEN'::public.runner_status
        ELSE 'ASSIGNED'::public.runner_status
      END,
      runner_accept_status = 'PENDING',
      runner_review_status = 'NOT_REVIEWED',
      runner_final_outcome = NULL,
      runner_comment = NULL,
      runner_reviewed_at = NULL,
      runner_reviewed_by = NULL,
      salesperson_action_required = false,
      salesperson_action_type = NULL,
      salesperson_action_due_date = NULL,
      updated_at = now()
  WHERE id = p_order_id;

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
    p_order_id,
    'DRIVER_FAILED_STATUS_CHANGED',
    p_actor_id,
    jsonb_build_object(
      'driver_status', v_order.driver_status,
      'driver_failed_reason', v_order.driver_failed_reason,
      'driver_next_delivery_date', v_order.driver_next_delivery_date,
      'runner_status', v_order.runner_status,
      'runner_accept_status', v_order.runner_accept_status,
      'runner_review_status', v_order.runner_review_status
    ),
    jsonb_build_object(
      'driver_status', 'DRIVER_FAILED',
      'driver_failed_reason', v_reason,
      'driver_next_delivery_date', v_next_delivery_date,
      'runner_status', CASE
        WHEN v_order.runner_status = 'TAKEN' THEN 'TAKEN'
        ELSE 'ASSIGNED'
      END,
      'runner_accept_status', 'PENDING',
      'runner_review_status', 'NOT_REVIEWED'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'driver_id', v_order.driver_id,
    'runner_id', v_order.runner_id,
    'driver_failed_reason', v_reason,
    'driver_next_delivery_date', v_next_delivery_date,
    'runner_accept_status', 'PENDING',
    'runner_review_status', 'NOT_REVIEWED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_driver_failed_status(uuid, uuid, text, date)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_driver_failed_status(uuid, uuid, text, date)
  TO authenticated;
