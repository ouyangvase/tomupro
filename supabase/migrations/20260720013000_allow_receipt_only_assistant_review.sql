-- Allow receipt-only runner assistants to accept or reject transfer receipts.
-- The UI exposes Receipt Inbox for assistants without delivery access, so the
-- RPC authorization must match that role shape even when can_confirm_receipt is
-- not explicitly enabled on older bindings.

CREATE OR REPLACE FUNCTION confirm_order_receipt(p_order_id UUID, p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, runner_id, receipt_status, payment_method
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.payment_method != 'TRANSFER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only transfer receipts can be accepted');
  END IF;

  -- Authorization: runner, explicit receipt assistant, or receipt-only assistant.
  IF v_order.runner_id != p_actor_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM runner_assistants
      WHERE assistant_id = p_actor_id
        AND runner_id = v_order.runner_id
        AND is_active = true
        AND (
          can_confirm_receipt = true
          OR COALESCE(can_deliver, false) = false
        )
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to confirm receipts');
    END IF;
  END IF;

  IF v_order.receipt_status = 'confirmed' THEN
    RETURN jsonb_build_object('success', true);
  END IF;

  IF v_order.receipt_status = 'rejected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt has already been rejected');
  END IF;

  UPDATE orders
  SET receipt_status = 'confirmed',
      receipt_confirmed_by = p_actor_id,
      receipt_confirmed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order', p_order_id, 'receipt_confirmed', p_actor_id,
    jsonb_build_object('receipt_status', COALESCE(v_order.receipt_status, 'pending')),
    jsonb_build_object('receipt_status', 'confirmed')
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION reject_order_receipt(p_order_id UUID, p_actor_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, runner_id, receipt_status, payment_method
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.payment_method != 'TRANSFER' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only transfer receipts can be rejected');
  END IF;

  -- Authorization: runner, explicit receipt assistant, or receipt-only assistant.
  IF v_order.runner_id != p_actor_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM runner_assistants
      WHERE assistant_id = p_actor_id
        AND runner_id = v_order.runner_id
        AND is_active = true
        AND (
          can_confirm_receipt = true
          OR COALESCE(can_deliver, false) = false
        )
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to reject receipts');
    END IF;
  END IF;

  IF v_order.receipt_status = 'confirmed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receipt has already been accepted');
  END IF;

  UPDATE orders
  SET receipt_status = 'rejected',
      receipt_rejected_reason = p_reason,
      updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'order', p_order_id, 'receipt_rejected', p_actor_id,
    jsonb_build_object('receipt_status', COALESCE(v_order.receipt_status, 'pending')),
    jsonb_build_object('receipt_status', 'rejected', 'receipt_rejected_reason', p_reason)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
