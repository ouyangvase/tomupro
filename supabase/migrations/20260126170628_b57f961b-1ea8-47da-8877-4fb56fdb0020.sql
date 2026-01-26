-- Part 1: Update process_delivery_queue_item to ALWAYS recalculate warehouse
-- This fixes the "Cannot create stock movement for inactive warehouse" error for managers

CREATE OR REPLACE FUNCTION public.process_delivery_queue_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_warehouse_id UUID;
  v_item RECORD;
  v_missing_items TEXT[];
BEGIN
  -- Get the order details
  SELECT o.id, o.salesperson_id, o.runner_id, o.order_code, o.stock_deducted
  INTO v_order
  FROM orders o
  WHERE o.id = NEW.order_id;

  -- Skip if order doesn't exist
  IF v_order IS NULL THEN
    UPDATE delivery_queue
    SET status = 'FAILED',
        error_message = 'Order not found',
        processed_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Skip if already processed
  IF v_order.stock_deducted = true THEN
    UPDATE delivery_queue
    SET status = 'COMPLETED',
        processed_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- CRITICAL FIX: ALWAYS recalculate the correct warehouse
  -- Never trust cached fulfillment_warehouse_id - it may be stale from role changes
  SELECT public.get_stock_owner_warehouse(NEW.order_id) INTO v_warehouse_id;

  -- Fallback: find any active warehouse for the salesperson
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE owner_user_id = v_order.salesperson_id
      AND is_active = true
    LIMIT 1;
  END IF;

  -- If still no warehouse, fail
  IF v_warehouse_id IS NULL THEN
    UPDATE delivery_queue
    SET status = 'FAILED',
        error_message = 'No active warehouse found for salesperson',
        processed_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Check stock availability for all items
  v_missing_items := ARRAY[]::TEXT[];
  FOR v_item IN
    SELECT oi.product_id, oi.qty, p.sku_name,
           COALESCE(sb.balance_qty, 0) as available
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN stock_balance_view sb ON sb.product_id = oi.product_id 
      AND sb.warehouse_id = v_warehouse_id
    WHERE oi.order_id = NEW.order_id
      AND oi.product_id IS NOT NULL
  LOOP
    IF v_item.available < v_item.qty THEN
      v_missing_items := array_append(v_missing_items, 
        format('%s (need %s, have %s)', v_item.sku_name, v_item.qty, v_item.available));
    END IF;
  END LOOP;

  -- If insufficient stock, fail the queue item
  IF array_length(v_missing_items, 1) > 0 THEN
    UPDATE delivery_queue
    SET status = 'FAILED',
        error_message = 'Insufficient stock: ' || array_to_string(v_missing_items, ', '),
        processed_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Create stock movements for each order item
  FOR v_item IN
    SELECT oi.id, oi.product_id, oi.qty
    FROM order_items oi
    WHERE oi.order_id = NEW.order_id
      AND oi.product_id IS NOT NULL
  LOOP
    INSERT INTO stock_movements (
      warehouse_id,
      product_id,
      movement_type,
      qty_change,
      reference_type,
      reference_id,
      created_by
    ) VALUES (
      v_warehouse_id,
      v_item.product_id,
      'SALE_DEDUCT',
      -v_item.qty,
      'ORDER_ITEM',
      v_item.id,
      COALESCE(auth.uid(), v_order.runner_id)
    );
  END LOOP;

  -- Update order to mark stock as deducted and set the correct warehouse
  UPDATE orders
  SET stock_deducted = true,
      fulfillment_warehouse_id = v_warehouse_id
  WHERE id = NEW.order_id;

  -- Mark queue item as completed
  UPDATE delivery_queue
  SET status = 'COMPLETED',
      processed_at = now()
  WHERE id = NEW.id;

  -- Create claim record
  INSERT INTO claims (order_id, amount, created_by)
  VALUES (NEW.order_id, v_order.total_amount, COALESCE(auth.uid(), v_order.runner_id))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE delivery_queue
    SET status = 'FAILED',
        error_message = SQLERRM,
        retry_count = COALESCE(retry_count, 0) + 1,
        processed_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

-- Part 2: Update set_default_fulfillment_warehouse to be role-aware
-- This prevents future stale warehouse IDs

CREATE OR REPLACE FUNCTION public.set_default_fulfillment_warehouse()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_warehouse_id UUID;
  v_user_role TEXT;
BEGIN
  IF NEW.fulfillment_warehouse_id IS NULL AND NEW.salesperson_id IS NOT NULL THEN
    -- Get the user's current role
    SELECT role::TEXT INTO v_user_role FROM profiles WHERE id = NEW.salesperson_id;
    
    -- Find the correct warehouse based on role
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE owner_user_id = NEW.salesperson_id
      AND warehouse_type = (CASE 
        WHEN v_user_role = 'manager' THEN 'MANAGER' 
        ELSE 'SALESPERSON' 
      END)::warehouse_type
      AND is_active = true
    LIMIT 1;
    
    NEW.fulfillment_warehouse_id := v_warehouse_id;
  END IF;
  RETURN NEW;
END;
$$;