-- Phase 4: Fix existing bad data - delete movements from inactive warehouses and recreate correctly
-- Using explicit type casting for warehouse_type comparison
DO $$
DECLARE
  v_order RECORD;
  v_correct_warehouse UUID;
  v_expected_type warehouse_type;
BEGIN
  -- Find delivered orders with movements in inactive or wrong-type warehouses
  FOR v_order IN 
    SELECT DISTINCT o.id as order_id, o.salesperson_id, o.runner_id, p.role as salesperson_role
    FROM orders o
    JOIN profiles p ON p.id = o.salesperson_id
    JOIN stock_movements sm ON sm.order_id = o.id
    JOIN warehouses w ON w.id = sm.warehouse_id
    WHERE o.runner_status = 'DELIVERED'
      AND o.stock_deducted = true
      AND (w.is_active = false OR w.warehouse_type != (CASE WHEN p.role = 'manager' THEN 'MANAGER'::warehouse_type ELSE 'SALESPERSON'::warehouse_type END))
  LOOP
    -- Determine expected type
    v_expected_type := CASE WHEN v_order.salesperson_role = 'manager' THEN 'MANAGER'::warehouse_type ELSE 'SALESPERSON'::warehouse_type END;
    
    -- Get correct warehouse
    SELECT id INTO v_correct_warehouse
    FROM warehouses
    WHERE owner_user_id = v_order.salesperson_id
      AND warehouse_type = v_expected_type
      AND is_active = true
    LIMIT 1;
    
    IF v_correct_warehouse IS NOT NULL THEN
      -- Delete wrong movements
      DELETE FROM stock_movements WHERE order_id = v_order.order_id;
      
      -- Recreate correct movements
      INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, order_id, created_by)
      SELECT v_correct_warehouse, oi.product_id, 'DELIVER_DEDUCT', -oi.qty, 'ORDER_ITEM', oi.id, v_order.order_id, v_order.runner_id
      FROM order_items oi
      WHERE oi.order_id = v_order.order_id AND oi.product_id IS NOT NULL;
      
      -- Update order's fulfillment warehouse
      UPDATE orders SET fulfillment_warehouse_id = v_correct_warehouse WHERE id = v_order.order_id;
    END IF;
  END LOOP;
END $$;