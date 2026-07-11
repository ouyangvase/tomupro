-- Operations Audit Trail: Fix RLS, add delivery audit logging, add indexes
-- 2026-06-25

-- 1) RLS: Let runners and runner_assistants read audit logs for their orders
CREATE POLICY "runners_view_own_order_audit_logs" ON public.audit_logs
  FOR SELECT USING (
    public.get_user_role(auth.uid()) IN ('runner', 'runner_assistant')
    AND entity_type = 'order'
    AND entity_id IN (
      SELECT id FROM orders WHERE runner_id = auth.uid()
      UNION
      SELECT o.id FROM orders o
      JOIN runner_assistants ra ON ra.runner_id = o.runner_id
      WHERE ra.assistant_id = auth.uid() AND ra.is_active = true
    )
  );

-- 2) Update mark_order_delivered_fast to insert audit log on delivery
CREATE OR REPLACE FUNCTION mark_order_delivered_fast(p_order_id UUID, p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, runner_id, runner_status, stock_deducted, payment_method, receipt_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Authorization: must be the runner OR an active assistant with can_deliver
  IF v_order.runner_id != p_actor_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM runner_assistants
      WHERE assistant_id = p_actor_id
        AND runner_id = v_order.runner_id
        AND can_deliver = true
        AND is_active = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
  END IF;

  -- Block delivery for TRANSFER orders without confirmed receipt
  IF v_order.payment_method = 'TRANSFER' AND COALESCE(v_order.receipt_status, '') != 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt must be confirmed before delivery for transfer orders');
  END IF;

  -- Return success immediately if already delivered (idempotent)
  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true);
  END IF;

  -- Now acquire lock and update
  SELECT id, runner_id, runner_status, stock_deducted
  INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE SKIP LOCKED;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order locked by another process');
  END IF;

  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true);
  END IF;

  UPDATE orders
  SET
    runner_status = 'DELIVERED',
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Audit log: record who marked this order as delivered
  INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order', p_order_id, 'delivered', p_actor_id,
    jsonb_build_object('runner_status', v_order.runner_status),
    jsonb_build_object('runner_status', 'DELIVERED', 'delivered_at', NOW())
  );

  INSERT INTO public.delivery_queue (order_id, queued_at, status)
  VALUES (p_order_id, NOW(), 'PENDING')
  ON CONFLICT (order_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'delivered_at', NOW(),
    'queued_for_processing', true
  );
END;
$$;

-- 3) Performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
