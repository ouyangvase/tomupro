-- Driver-reported deliveries must use the canonical acceptance boundary.
-- Manual runner delivery remains unchanged for orders without a Driver report.

CREATE OR REPLACE FUNCTION public.mark_order_delivered_fast(
  p_order_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid actor');
  END IF;

  SELECT id, runner_id, runner_status, driver_status, stock_deducted,
         payment_method, receipt_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'deliver')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery access required');
  END IF;

  IF v_order.payment_method = 'TRANSFER'
    AND COALESCE(v_order.receipt_status, '') <> 'confirmed'
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt must be confirmed before delivery for transfer orders');
  END IF;

  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true);
  END IF;

  SELECT id, runner_id, runner_status, driver_status, stock_deducted
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE SKIP LOCKED;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order locked by another process');
  END IF;

  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true);
  END IF;

  IF v_order.driver_status = 'DRIVER_DELIVERED' THEN
    RETURN public.review_driver_delivery(p_order_id, p_actor_id, true, NULL);
  END IF;

  UPDATE public.orders
  SET runner_status = 'DELIVERED',
      delivered_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order',
    p_order_id,
    'delivered',
    p_actor_id,
    jsonb_build_object('runner_status', v_order.runner_status),
    jsonb_build_object('runner_status', 'DELIVERED', 'delivered_at', now())
  );

  INSERT INTO public.delivery_queue (order_id, queued_at, status)
  VALUES (p_order_id, now(), 'PENDING')
  ON CONFLICT (order_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'delivered_at', now(),
    'queued_for_processing', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_delivered_fast(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
