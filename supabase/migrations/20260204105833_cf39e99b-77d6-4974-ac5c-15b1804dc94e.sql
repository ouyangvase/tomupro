-- Fix the repair function to handle duplicates gracefully with ON CONFLICT
CREATE OR REPLACE FUNCTION repair_missing_stock_deductions(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_count integer := 0;
  v_fixed_count integer := 0;
  v_queue_cleared integer := 0;
  v_errors text[] := '{}';
  v_fixed_orders text[] := '{}';
  v_rec record;
BEGIN
  -- Find all DELIVERED order_items that don't have a matching SALE_DEDUCT movement
  CREATE TEMP TABLE temp_missing_deductions AS
  SELECT 
    oi.id as order_item_id,
    oi.order_id,
    oi.product_id,
    oi.qty,
    o.order_code,
    o.salesperson_id,
    p.owner_id as product_owner_id,
    w.id as warehouse_id
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN products p ON p.id = oi.product_id
  LEFT JOIN warehouses w ON w.owner_id = p.owner_id AND w.is_active = true
  WHERE o.status = 'DELIVERED'
    AND NOT EXISTS (
      SELECT 1 FROM stock_movements sm
      WHERE sm.reference_id = oi.order_id
        AND sm.product_id = oi.product_id
        AND sm.movement_type = 'SALE_DEDUCT'
    );
  
  SELECT COUNT(*) INTO v_missing_count FROM temp_missing_deductions;
  
  IF NOT p_dry_run AND v_missing_count > 0 THEN
    -- Insert missing deductions with ON CONFLICT DO NOTHING for idempotency
    FOR v_rec IN SELECT * FROM temp_missing_deductions WHERE warehouse_id IS NOT NULL
    LOOP
      BEGIN
        INSERT INTO stock_movements (
          warehouse_id,
          product_id,
          movement_type,
          qty_change,
          reference_type,
          reference_id,
          created_by,
          notes
        ) VALUES (
          v_rec.warehouse_id,
          v_rec.product_id,
          'SALE_DEDUCT',
          -v_rec.qty,
          'ORDER',
          v_rec.order_id,
          v_rec.salesperson_id,
          'Auto-repair: Missing deduction for ' || v_rec.order_code
        )
        ON CONFLICT (warehouse_id, product_id, reference_id) 
        WHERE movement_type = 'SALE_DEDUCT' AND reference_id IS NOT NULL
        DO NOTHING;
        
        -- Check if insert happened
        IF FOUND THEN
          v_fixed_count := v_fixed_count + 1;
          v_fixed_orders := array_append(v_fixed_orders, v_rec.order_code);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := array_append(v_errors, v_rec.order_code || ': ' || SQLERRM);
      END;
    END LOOP;
    
    -- Mark stale delivery_queue items as reprocessed
    UPDATE delivery_queue
    SET status = 'REPROCESSED', processed_at = now()
    WHERE status IN ('PENDING', 'FAILED')
      AND order_id IN (SELECT order_id FROM temp_missing_deductions);
    
    GET DIAGNOSTICS v_queue_cleared = ROW_COUNT;
  END IF;
  
  DROP TABLE IF EXISTS temp_missing_deductions;
  
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'missing_deductions', v_missing_count,
    'fixed_deductions', v_fixed_count,
    'queue_cleared', v_queue_cleared,
    'errors', v_errors,
    'fixed_orders', v_fixed_orders
  );
END;
$$;

-- Also fix the full rebuild function
CREATE OR REPLACE FUNCTION apply_full_stock_rebuild(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_skus integer := 0;
  v_ok_count integer := 0;
  v_mismatch_count integer := 0;
  v_negative_count integer := 0;
  v_fixed_deductions integer := 0;
  v_repair_result jsonb;
BEGIN
  -- First run the repair for missing deductions
  IF NOT p_dry_run THEN
    v_repair_result := repair_missing_stock_deductions(false);
    v_fixed_deductions := COALESCE((v_repair_result->>'fixed_deductions')::integer, 0);
  END IF;
  
  -- Get counts from audit
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'OK'),
    COUNT(*) FILTER (WHERE status = 'MISMATCH'),
    COUNT(*) FILTER (WHERE status = 'NEGATIVE')
  INTO v_total_skus, v_ok_count, v_mismatch_count, v_negative_count
  FROM full_stock_integrity_audit(null, null);
  
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'total_skus_scanned', v_total_skus,
    'ok_count', v_ok_count,
    'mismatch_count', v_mismatch_count,
    'negative_count', v_negative_count,
    'missing_deductions_fixed', v_fixed_deductions
  );
END;
$$;