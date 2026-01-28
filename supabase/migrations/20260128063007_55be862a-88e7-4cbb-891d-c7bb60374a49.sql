-- Reprocess all PENDING delivery queue items by deleting and re-inserting them
-- This will trigger the process_delivery_queue_item function for each one

DO $$
DECLARE
  v_order_id UUID;
  v_pending_orders UUID[];
BEGIN
  -- Get all pending order IDs
  SELECT ARRAY_AGG(order_id) INTO v_pending_orders
  FROM delivery_queue
  WHERE status = 'PENDING';
  
  -- Delete all pending items
  DELETE FROM delivery_queue WHERE status = 'PENDING';
  
  -- Re-insert them to trigger processing
  IF v_pending_orders IS NOT NULL THEN
    INSERT INTO delivery_queue (order_id, status)
    SELECT unnest(v_pending_orders), 'PENDING'
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
END;
$$;