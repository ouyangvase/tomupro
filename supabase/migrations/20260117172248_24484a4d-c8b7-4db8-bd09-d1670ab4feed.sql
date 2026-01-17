
-- Fix the trigger to allow idempotent delivered operations
-- The trigger should only block STATUS CHANGES from DELIVERED, not re-setting to DELIVERED

CREATE OR REPLACE FUNCTION check_delivered_order_lock()
RETURNS TRIGGER AS $$
DECLARE
  user_role app_role;
BEGIN
  -- Get the current user's role
  user_role := get_user_role(auth.uid());
  
  -- Check if the order was already delivered (OLD runner_status = 'DELIVERED')
  -- and user is not admin
  IF OLD.runner_status = 'DELIVERED' AND user_role != 'admin' THEN
    -- ALLOW idempotent delivery (setting to DELIVERED when already DELIVERED)
    -- This handles race conditions and retries gracefully
    IF NEW.runner_status = 'DELIVERED' THEN
      -- Idempotent operation - allow it
      RETURN NEW;
    END IF;
    
    -- Block any other status change attempts by non-admin
    RAISE EXCEPTION 'Order already delivered. Only admin can modify status.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also update the mark_order_delivered_fast function to properly return early for already delivered
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
  SELECT id, runner_id, runner_status, stock_deducted
  INTO v_order
  FROM orders
  WHERE id = p_order_id;
  
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  
  IF v_order.runner_id != p_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
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
