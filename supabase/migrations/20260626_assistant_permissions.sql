-- Runner Assistant Permissions: RPCs, Event Queue, Telegram Auto-Enable
-- 2026-06-26

-- ═══════════════════════════════════════════════════════════════
-- 1A. Receipt Confirmation RPC (enforces can_confirm_receipt)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION confirm_order_receipt(p_order_id UUID, p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, runner_id, receipt_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Authorization: must be the runner OR an active assistant with can_confirm_receipt
  IF v_order.runner_id != p_actor_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM runner_assistants
      WHERE assistant_id = p_actor_id
        AND runner_id = v_order.runner_id
        AND can_confirm_receipt = true
        AND is_active = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to confirm receipts');
    END IF;
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

-- ═══════════════════════════════════════════════════════════════
-- 1B. Receipt Rejection RPC (enforces can_confirm_receipt)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reject_order_receipt(p_order_id UUID, p_actor_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, runner_id, receipt_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Authorization: must be the runner OR an active assistant with can_confirm_receipt
  IF v_order.runner_id != p_actor_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM runner_assistants
      WHERE assistant_id = p_actor_id
        AND runner_id = v_order.runner_id
        AND can_confirm_receipt = true
        AND is_active = true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized to reject receipts');
    END IF;
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

-- ═══════════════════════════════════════════════════════════════
-- 1C. Auto-enable Telegram for Runner Assistants
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION auto_enable_assistant_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true THEN
    INSERT INTO telegram_notification_permissions (user_id, admin_enabled)
    VALUES (NEW.assistant_id, true)
    ON CONFLICT (user_id) DO UPDATE SET admin_enabled = true, updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enable_assistant_telegram ON runner_assistants;
CREATE TRIGGER trg_auto_enable_assistant_telegram
  AFTER INSERT OR UPDATE ON runner_assistants
  FOR EACH ROW
  EXECUTE FUNCTION auto_enable_assistant_telegram();

-- Auto-enable existing active assistants
INSERT INTO telegram_notification_permissions (user_id, admin_enabled)
SELECT assistant_id, true FROM runner_assistants WHERE is_active = true
ON CONFLICT (user_id) DO UPDATE SET admin_enabled = true, updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════
-- 1D. Event notification preference columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE user_telegram_settings
  ADD COLUMN IF NOT EXISTS receive_receipt_events BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receive_delivery_events BOOLEAN DEFAULT true;

-- ═══════════════════════════════════════════════════════════════
-- 1E. Telegram event queue
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS telegram_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id),
  runner_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE telegram_event_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on event queue" ON telegram_event_queue
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_telegram_event_queue_unprocessed
  ON telegram_event_queue (processed, created_at)
  WHERE processed = false;

-- ═══════════════════════════════════════════════════════════════
-- 1F. Trigger to queue events on order changes
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION queue_telegram_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT;
  v_metadata JSONB;
BEGIN
  -- Receipt status changes
  IF OLD.receipt_status IS DISTINCT FROM NEW.receipt_status THEN
    IF NEW.receipt_status = 'pending' AND OLD.receipt_status IS NULL THEN
      v_event_type := 'receipt_uploaded';
    ELSIF NEW.receipt_status = 'pending' AND OLD.receipt_status = 'rejected' THEN
      v_event_type := 'receipt_reuploaded';
    ELSIF NEW.receipt_status = 'rejected' THEN
      v_event_type := 'receipt_rejected';
    ELSIF NEW.receipt_status = 'confirmed' THEN
      v_event_type := 'receipt_confirmed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      SELECT jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'receipt_status', NEW.receipt_status
      ) INTO v_metadata;

      INSERT INTO telegram_event_queue (event_type, order_id, runner_id, metadata)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata);
    END IF;
  END IF;

  -- Runner status changes
  IF OLD.runner_status IS DISTINCT FROM NEW.runner_status THEN
    v_event_type := NULL;
    IF NEW.runner_status = 'ASSIGNED' THEN
      v_event_type := 'order_assigned';
    ELSIF NEW.runner_status = 'TAKEN' THEN
      v_event_type := 'order_taken';
    ELSIF NEW.runner_status = 'DELIVERED' THEN
      v_event_type := 'order_delivered';
    ELSIF NEW.runner_status = 'FAILED_DELIVERY' THEN
      v_event_type := 'delivery_failed';
    END IF;

    IF v_event_type IS NOT NULL THEN
      SELECT jsonb_build_object(
        'order_code', NEW.order_code,
        'customer_name', NEW.customer_name,
        'total_amount', NEW.total_amount,
        'payment_method', NEW.payment_method,
        'runner_status', NEW.runner_status,
        'prev_runner_status', OLD.runner_status
      ) INTO v_metadata;

      INSERT INTO telegram_event_queue (event_type, order_id, runner_id, metadata)
      VALUES (v_event_type, NEW.id, NEW.runner_id, v_metadata);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_telegram_order_event ON orders;
CREATE TRIGGER trg_queue_telegram_order_event
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION queue_telegram_order_event();
