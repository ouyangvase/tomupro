-- Create a high-performance function to repair missing stock deductions
-- This runs entirely in the database to avoid edge function timeouts

CREATE OR REPLACE FUNCTION repair_missing_stock_deductions(p_dry_run BOOLEAN DEFAULT true)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_count INT := 0;
  v_fixed_count INT := 0;
  v_queue_cleared INT := 0;
  v_errors TEXT[] := '{}';
  v_fixed_orders TEXT[] := '{}';
  r RECORD;
BEGIN
  -- Step 1: Count/fix missing deductions for DELIVERED orders
  -- Find all order_items from DELIVERED orders that don't have a corresponding DELIVER_DEDUCT movement
  
  FOR r IN 
    SELECT 
      oi.id as order_item_id,
      oi.order_id,
      oi.product_id,
      oi.qty,
      o.order_code,
      o.salesperson_id,
      p.role as salesperson_role,
      COALESCE(
        (SELECT w.id FROM warehouses w 
         WHERE w.owner_user_id = o.salesperson_id 
         AND w.is_active = true 
         AND w.warehouse_type = (CASE WHEN p.role = 'manager' THEN 'MANAGER' ELSE 'SALESPERSON' END)::warehouse_type
         LIMIT 1),
        o.fulfillment_warehouse_id
      ) as warehouse_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN profiles p ON p.id = o.salesperson_id
    WHERE o.runner_status = 'DELIVERED'
    AND oi.product_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM stock_movements sm
      WHERE sm.reference_id = oi.id
      AND sm.movement_type = 'SALE_DEDUCT'
      AND sm.reference_type = 'ORDER_ITEM'
    )
  LOOP
    v_missing_count := v_missing_count + 1;
    v_fixed_orders := array_append(v_fixed_orders, r.order_code);
    
    IF NOT p_dry_run AND r.warehouse_id IS NOT NULL THEN
      BEGIN
        -- Insert the missing deduction (negative qty)
        INSERT INTO stock_movements (
          warehouse_id,
          product_id,
          movement_type,
          qty_change,
          reference_type,
          reference_id,
          created_by
        ) VALUES (
          r.warehouse_id,
          r.product_id,
          'SALE_DEDUCT',
          -r.qty,  -- Negative for deduction
          'ORDER_ITEM',
          r.order_item_id,
          r.salesperson_id
        );
        
        v_fixed_count := v_fixed_count + 1;
      EXCEPTION WHEN OTHERS THEN
        v_errors := array_append(v_errors, 'Order ' || r.order_code || ': ' || SQLERRM);
      END;
    END IF;
  END LOOP;
  
  -- Step 2: Update stock_deducted flag on orders that now have all deductions
  IF NOT p_dry_run THEN
    UPDATE orders o
    SET stock_deducted = true
    WHERE o.runner_status = 'DELIVERED'
    AND o.stock_deducted = false
    AND NOT EXISTS (
      SELECT 1 FROM order_items oi
      WHERE oi.order_id = o.id
      AND oi.product_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements sm
        WHERE sm.reference_id = oi.id
        AND sm.movement_type = 'SALE_DEDUCT'
      )
    );
    
    -- Step 3: Clear failed delivery queue items
    UPDATE delivery_queue
    SET status = 'REPROCESSED', processed_at = now()
    WHERE status = 'FAILED';
    
    GET DIAGNOSTICS v_queue_cleared = ROW_COUNT;
  ELSE
    -- In dry run, just count failed queue items
    SELECT COUNT(*) INTO v_queue_cleared
    FROM delivery_queue
    WHERE status = 'FAILED';
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'missing_deductions', v_missing_count,
    'fixed_deductions', v_fixed_count,
    'queue_cleared', v_queue_cleared,
    'errors', v_errors,
    'fixed_orders', (SELECT array_agg(DISTINCT x) FROM unnest(v_fixed_orders) x LIMIT 50)
  );
END;
$$;

-- Grant execute permission to authenticated users (admin check is in the UI)
GRANT EXECUTE ON FUNCTION repair_missing_stock_deductions(BOOLEAN) TO authenticated;