-- Keep delegated Runner actions tied to the authenticated actor and create
-- Driver cash liabilities only after a delivered report is accepted.

DELETE FROM public.cash_liabilities liability
USING public.orders order_row
WHERE liability.order_id = order_row.id
  AND liability.status = 'OPEN'
  AND (
    order_row.driver_status IS DISTINCT FROM 'DRIVER_DELIVERED'
    OR order_row.runner_accept_status IS DISTINCT FROM 'ACCEPTED'
  );

DROP POLICY IF EXISTS "Runner assistants can view bound runner drivers" ON public.runner_drivers;
CREATE POLICY "Runner assistants can view bound runner drivers"
  ON public.runner_drivers FOR SELECT
  USING (
    public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_inbox')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_stock')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_operations')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'driver_workload')
    OR public.has_runner_assistant_permission(auth.uid(), runner_id, 'cash_settlement')
  );

CREATE OR REPLACE FUNCTION public.review_driver_delivery(
  p_order_id uuid,
  p_actor_id uuid,
  p_accept boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_action text;
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

  IF v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'driver_operations')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver Operations access required');
  END IF;

  IF v_order.driver_status NOT IN ('DRIVER_DELIVERED', 'DRIVER_FAILED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Driver report is not ready for review');
  END IF;

  IF p_accept THEN
    IF v_order.driver_status = 'DRIVER_FAILED' THEN
      UPDATE public.orders
      SET runner_accept_status = 'ACCEPTED',
          runner_status = 'FAILED_DELIVERY',
          updated_at = now()
      WHERE id = p_order_id;
      v_action := 'DRIVER_FAILURE_ACCEPTED';
    ELSE
      UPDATE public.orders
      SET runner_accept_status = 'ACCEPTED',
          runner_status = 'DELIVERED',
          delivered_at = now(),
          updated_at = now()
      WHERE id = p_order_id;

      IF COALESCE(v_order.driver_cash_amount, 0) > 0 THEN
        INSERT INTO public.cash_liabilities (
          runner_id,
          driver_id,
          order_id,
          order_code,
          customer_name,
          cash_amount,
          delivered_at,
          status
        )
        VALUES (
          v_order.runner_id,
          v_order.driver_id,
          v_order.id,
          v_order.order_code,
          v_order.customer_name,
          v_order.driver_cash_amount,
          now(),
          'OPEN'
        )
        ON CONFLICT (order_id) DO UPDATE
        SET runner_id = EXCLUDED.runner_id,
            driver_id = EXCLUDED.driver_id,
            order_code = EXCLUDED.order_code,
            customer_name = EXCLUDED.customer_name,
            cash_amount = EXCLUDED.cash_amount,
            delivered_at = EXCLUDED.delivered_at
        WHERE public.cash_liabilities.status = 'OPEN';
      END IF;

      v_action := 'DRIVER_DELIVERY_ACCEPTED';
    END IF;
  ELSE
    UPDATE public.orders
    SET runner_accept_status = 'REJECTED',
        driver_status = 'OUT_FOR_DELIVERY',
        driver_failed_remark = p_reason,
        updated_at = now()
    WHERE id = p_order_id;
    v_action := 'DRIVER_REPORT_REJECTED';
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order',
    p_order_id,
    v_action,
    p_actor_id,
    jsonb_build_object(
      'runner_status', v_order.runner_status,
      'driver_status', v_order.driver_status,
      'runner_accept_status', v_order.runner_accept_status
    ),
    jsonb_build_object(
      'runner_id', v_order.runner_id,
      'driver_id', v_order.driver_id,
      'accepted', p_accept,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'runner_id', v_order.runner_id,
    'driver_id', v_order.driver_id,
    'action', v_action
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_delivered_fast(p_order_id uuid, p_actor_id uuid)
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

  SELECT id, runner_id, runner_status, stock_deducted, payment_method, receipt_status
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

  SELECT id, runner_id, runner_status, stock_deducted
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

CREATE OR REPLACE FUNCTION public.confirm_order_receipt(p_order_id uuid, p_actor_id uuid)
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

  SELECT id, runner_id, receipt_status, payment_method
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.payment_method <> 'TRANSFER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only transfer receipts can be accepted');
  END IF;

  IF v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'confirm_receipt')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt confirmation access required');
  END IF;

  IF v_order.receipt_status = 'confirmed' THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  IF v_order.receipt_status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt has already been rejected');
  END IF;

  UPDATE public.orders
  SET receipt_status = 'confirmed',
      receipt_confirmed_by = p_actor_id,
      receipt_confirmed_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order',
    p_order_id,
    'receipt_confirmed',
    p_actor_id,
    jsonb_build_object('receipt_status', COALESCE(v_order.receipt_status, 'pending')),
    jsonb_build_object('receipt_status', 'confirmed')
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_order_receipt(
  p_order_id uuid,
  p_actor_id uuid,
  p_reason text
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

  SELECT id, runner_id, receipt_status, payment_method
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.payment_method <> 'TRANSFER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only transfer receipts can be rejected');
  END IF;

  IF v_order.runner_id IS DISTINCT FROM p_actor_id
    AND NOT public.has_runner_assistant_permission(p_actor_id, v_order.runner_id, 'confirm_receipt')
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt confirmation access required');
  END IF;

  IF v_order.receipt_status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt has already been accepted');
  END IF;

  UPDATE public.orders
  SET receipt_status = 'rejected',
      receipt_rejected_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order',
    p_order_id,
    'receipt_rejected',
    p_actor_id,
    jsonb_build_object('receipt_status', COALESCE(v_order.receipt_status, 'pending')),
    jsonb_build_object('receipt_status', 'rejected', 'receipt_rejected_reason', p_reason)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

DROP POLICY IF EXISTS "Runners and assistants view delegated operation audit logs" ON public.audit_logs;
CREATE POLICY "Runners and assistants view delegated operation audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    actor_id = auth.uid()
    OR (
      entity_type = 'cash_settlement_batch'
      AND EXISTS (
        SELECT 1
        FROM public.cash_settlement_batches batch
        WHERE batch.id = audit_logs.entity_id
          AND (
            batch.runner_id = auth.uid()
            OR public.has_runner_assistant_permission(auth.uid(), batch.runner_id, 'cash_settlement')
          )
      )
    )
    OR (
      entity_type = 'inbound_shipment'
      AND EXISTS (
        SELECT 1
        FROM public.inbound_shipments shipment
        WHERE shipment.id = audit_logs.entity_id
          AND (
            shipment.runner_id = auth.uid()
            OR public.has_runner_assistant_permission(auth.uid(), shipment.runner_id, 'inbound_stock')
          )
      )
    )
  );

GRANT EXECUTE ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_delivered_fast(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_receipt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order_receipt(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
