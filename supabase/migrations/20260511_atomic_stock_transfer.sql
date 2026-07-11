-- Atomic stock transfer RPC function
-- Performs the entire transfer in a single transaction:
--   1. Validates stock availability
--   2. Ensures destination products exist (creates if needed)
--   3. Creates stock_transfers record
--   4. Creates stock_transfer_items
--   5. Creates TRANSFER_OUT and TRANSFER_IN stock_movements
-- If any step fails, the entire transaction is rolled back.

CREATE OR REPLACE FUNCTION public.execute_stock_transfer(
  p_from_owner_id UUID,
  p_to_owner_id UUID,
  p_from_warehouse_id UUID,
  p_to_warehouse_id UUID,
  p_items JSONB,        -- Array of {product_id, qty}
  p_notes TEXT DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_transfer_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty INT;
  v_source_balance BIGINT;
  v_dest_balance BIGINT;
  v_source_product RECORD;
  v_dest_product_id UUID;
  v_results JSONB := '[]'::JSONB;
  v_total_qty INT := 0;
  v_items_count INT := 0;
BEGIN
  -- Determine actor
  v_actor := COALESCE(p_actor_id, auth.uid());
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Validate inputs
  IF p_from_owner_id IS NULL OR p_to_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'From and To owners are required');
  END IF;
  IF p_from_owner_id = p_to_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to the same owner');
  END IF;
  IF p_from_warehouse_id IS NULL OR p_to_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'From and To warehouses are required');
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least one item is required');
  END IF;

  -- Validate warehouses exist and belong to correct owners
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = p_from_warehouse_id AND owner_user_id = p_from_owner_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source warehouse not found or does not belong to from-owner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = p_to_warehouse_id AND owner_user_id = p_to_owner_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Destination warehouse not found or does not belong to to-owner');
  END IF;

  -- Create transfer record
  INSERT INTO stock_transfers (from_owner_id, to_owner_id, from_warehouse_id, to_warehouse_id, notes, created_by)
  VALUES (p_from_owner_id, p_to_owner_id, p_from_warehouse_id, p_to_warehouse_id, p_notes, v_actor)
  RETURNING id INTO v_transfer_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_qty := (v_item ->> 'qty')::INT;

    -- Validate qty
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Transfer quantity must be greater than 0';
    END IF;

    -- Get source product details
    SELECT id, sku_code, sku_name, owner_user_id
    INTO v_source_product
    FROM products
    WHERE id = v_product_id;

    IF v_source_product IS NULL THEN
      RAISE EXCEPTION 'Product % not found', v_product_id;
    END IF;

    -- Check source stock balance
    SELECT COALESCE(SUM(sm.qty_change), 0) INTO v_source_balance
    FROM stock_movements sm
    WHERE sm.warehouse_id = p_from_warehouse_id
      AND sm.product_id = v_product_id;

    IF v_source_balance < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for %. Available: %, Requested: %',
        COALESCE(v_source_product.sku_code, v_product_id::TEXT), v_source_balance, v_qty;
    END IF;

    -- Find or create destination product (match by sku_code)
    v_dest_product_id := NULL;

    IF v_source_product.sku_code IS NOT NULL THEN
      SELECT id INTO v_dest_product_id
      FROM products
      WHERE owner_user_id = p_to_owner_id
        AND sku_code = v_source_product.sku_code
        AND is_active = true
      LIMIT 1;
    END IF;

    -- If not found by sku_code, try sku_name
    IF v_dest_product_id IS NULL AND v_source_product.sku_name IS NOT NULL THEN
      SELECT id INTO v_dest_product_id
      FROM products
      WHERE owner_user_id = p_to_owner_id
        AND sku_name = v_source_product.sku_name
        AND is_active = true
      LIMIT 1;
    END IF;

    -- Create product for destination if needed
    IF v_dest_product_id IS NULL THEN
      INSERT INTO products (owner_user_id, sku_code, sku_name, is_active, created_by)
      VALUES (p_to_owner_id, v_source_product.sku_code, v_source_product.sku_name, true, v_actor)
      RETURNING id INTO v_dest_product_id;
    END IF;

    -- Get destination balance before transfer (for audit)
    SELECT COALESCE(SUM(sm.qty_change), 0) INTO v_dest_balance
    FROM stock_movements sm
    WHERE sm.warehouse_id = p_to_warehouse_id
      AND sm.product_id = v_dest_product_id;

    -- Create transfer item record
    INSERT INTO stock_transfer_items (transfer_id, product_id, qty)
    VALUES (v_transfer_id, v_product_id, v_qty);

    -- TRANSFER_OUT from source (deduct)
    INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
    VALUES (p_from_warehouse_id, v_product_id, 'TRANSFER_OUT', -v_qty, 'STOCK_TRANSFER', v_transfer_id, v_actor);

    -- TRANSFER_IN to destination (add)
    INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
    VALUES (p_to_warehouse_id, v_dest_product_id, 'TRANSFER_IN', v_qty, 'STOCK_TRANSFER', v_transfer_id, v_actor);

    -- Build result for this item
    v_results := v_results || jsonb_build_object(
      'sku_code', v_source_product.sku_code,
      'qty', v_qty,
      'from_balance_before', v_source_balance,
      'from_balance_after', v_source_balance - v_qty,
      'to_balance_before', v_dest_balance,
      'to_balance_after', v_dest_balance + v_qty,
      'source_product_id', v_product_id,
      'dest_product_id', v_dest_product_id
    );

    v_total_qty := v_total_qty + v_qty;
    v_items_count := v_items_count + 1;
  END LOOP;

  -- Log to audit
  INSERT INTO audit_logs (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES (
    'stock_transfer',
    v_transfer_id,
    'TRANSFER_EXECUTED',
    jsonb_build_object('from_owner_id', p_from_owner_id, 'to_owner_id', p_to_owner_id),
    jsonb_build_object('items', v_results, 'notes', p_notes, 'total_qty', v_total_qty),
    v_actor
  );

  RETURN jsonb_build_object(
    'success', true,
    'transfer_id', v_transfer_id,
    'items_processed', v_items_count,
    'total_qty', v_total_qty,
    'details', v_results
  );

EXCEPTION WHEN OTHERS THEN
  -- Transaction auto-rolls back; return error
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.execute_stock_transfer(UUID, UUID, UUID, UUID, JSONB, TEXT, UUID) TO authenticated;
