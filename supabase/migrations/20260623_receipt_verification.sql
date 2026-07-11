-- =============================================
-- Receipt Verification for Bank Transfer Orders
-- =============================================

-- 1) Add receipt columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_confirmed_by uuid REFERENCES profiles(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_confirmed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_rejected_reason text;

COMMENT ON COLUMN public.orders.receipt_status IS 'NULL for COD orders. pending/confirmed/rejected for TRANSFER orders';

-- 2) Add CHECK constraint for receipt_status values
DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT chk_receipt_status
    CHECK (receipt_status IS NULL OR receipt_status IN ('pending', 'confirmed', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Index for filtering by receipt_status
CREATE INDEX IF NOT EXISTS idx_orders_receipt_status ON public.orders (receipt_status)
  WHERE receipt_status IS NOT NULL;

-- 4) Update mark_order_delivered_fast to block delivery for unconfirmed TRANSFER receipts
CREATE OR REPLACE FUNCTION mark_order_delivered_fast(p_order_id UUID, p_actor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- First check order status without lock to avoid unnecessary locking
  SELECT id, runner_id, runner_status, stock_deducted, payment_method, receipt_status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.runner_id != p_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
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

  -- Double check after acquiring lock (in case of race condition)
  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true);
  END IF;

  UPDATE orders
  SET
    runner_status = 'DELIVERED',
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

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
