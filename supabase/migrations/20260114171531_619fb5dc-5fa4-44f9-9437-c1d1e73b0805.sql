
-- Fix manager inbound visibility and acknowledgment

-- 1. Fix RLS policy for inbound_shipments UPDATE - allow managers to update team member shipments
DROP POLICY IF EXISTS "Salesperson can update inbound shipments" ON inbound_shipments;

CREATE POLICY "Users can update inbound shipments"
ON inbound_shipments
FOR UPDATE
USING (
  -- Admin can update any
  get_user_role(auth.uid()) = 'admin'::app_role
  OR
  -- Salesperson can update their own
  auth.uid() = salesperson_id
  OR
  -- Manager can update for their team members
  (
    get_user_role(auth.uid()) = 'manager'::app_role
    AND (
      salesperson_id = auth.uid()
      OR is_in_manager_team(salesperson_id, auth.uid())
    )
  )
);

-- 2. Create an atomic RPC for acknowledge + stock add
-- This ensures stock is added to the correct target (salesperson's warehouse)
CREATE OR REPLACE FUNCTION ack_inbound_and_add_stock(p_shipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shipment RECORD;
  v_item RECORD;
  v_warehouse_id uuid;
  v_product_id uuid;
  v_total_qty int := 0;
  v_lines_count int := 0;
  v_caller_role app_role;
  v_is_authorized boolean := false;
BEGIN
  -- Get caller role
  v_caller_role := get_user_role(auth.uid());
  
  -- Load shipment (single row)
  SELECT * INTO v_shipment
  FROM inbound_shipments
  WHERE id = p_shipment_id
  LIMIT 1;
  
  IF v_shipment IS NULL THEN
    RAISE EXCEPTION 'Shipment not found: %', p_shipment_id;
  END IF;
  
  -- Check status
  IF v_shipment.status != 'PENDING_SP_ACK' THEN
    RAISE EXCEPTION 'Shipment already processed. Current status: %', v_shipment.status;
  END IF;
  
  -- Authorization check
  IF v_caller_role = 'admin' THEN
    v_is_authorized := true;
  ELSIF auth.uid() = v_shipment.salesperson_id THEN
    -- Salesperson can acknowledge their own
    v_is_authorized := true;
  ELSIF v_caller_role = 'manager' THEN
    -- Manager can acknowledge for team OR for themselves
    IF v_shipment.salesperson_id = auth.uid() THEN
      v_is_authorized := true;
    ELSIF is_in_manager_team(v_shipment.salesperson_id, auth.uid()) THEN
      v_is_authorized := true;
    END IF;
  END IF;
  
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to acknowledge this shipment';
  END IF;
  
  -- Find target warehouse (the salesperson's warehouse)
  SELECT id INTO v_warehouse_id
  FROM warehouses
  WHERE owner_user_id = v_shipment.salesperson_id
    AND warehouse_type = 'SALESPERSON'
  LIMIT 1;
  
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No warehouse found for target user. Please create a warehouse first.';
  END IF;
  
  -- Process each item
  FOR v_item IN 
    SELECT * FROM inbound_items WHERE inbound_id = p_shipment_id
  LOOP
    v_product_id := v_item.product_id;
    
    -- If product_id is null, try to resolve by temp_sku_label
    IF v_product_id IS NULL AND v_item.temp_sku_label IS NOT NULL THEN
      SELECT id INTO v_product_id
      FROM products
      WHERE owner_id = v_shipment.salesperson_id
        AND (sku_code = v_item.temp_sku_label OR sku_name = v_item.temp_sku_label)
        AND status = 'Active'
      LIMIT 1;
    END IF;
    
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Could not resolve product for item: %. SKU not found for target user.', COALESCE(v_item.temp_sku_label, v_item.id::text);
    END IF;
    
    -- Update item with resolved product_id if it was null
    IF v_item.product_id IS NULL THEN
      UPDATE inbound_items
      SET product_id = v_product_id, qty_acknowledged = v_item.qty_reported
      WHERE id = v_item.id;
    ELSE
      UPDATE inbound_items
      SET qty_acknowledged = v_item.qty_reported
      WHERE id = v_item.id;
    END IF;
    
    -- Create stock movement
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
      v_product_id,
      'INBOUND',
      v_item.qty_reported,
      'INBOUND_ITEM',
      v_item.id,
      auth.uid()
    );
    
    v_total_qty := v_total_qty + v_item.qty_reported;
    v_lines_count := v_lines_count + 1;
  END LOOP;
  
  -- Update shipment status
  UPDATE inbound_shipments
  SET status = 'ACKNOWLEDGED'
  WHERE id = p_shipment_id;
  
  -- Return summary
  RETURN jsonb_build_object(
    'success', true,
    'shipment_id', p_shipment_id,
    'total_qty', v_total_qty,
    'lines_count', v_lines_count,
    'warehouse_id', v_warehouse_id
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION ack_inbound_and_add_stock(uuid) TO authenticated;
