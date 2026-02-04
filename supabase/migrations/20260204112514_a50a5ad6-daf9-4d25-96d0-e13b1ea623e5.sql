-- Fix repair_missing_stock_deductions to use correct enum value 'ORDER_ITEM' instead of 'ORDER'
-- Also ensure we use text comparison for order status to avoid enum casting issues

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
  v_errors text[] := ARRAY[]::text[];
  v_fixed_orders text[] := ARRAY[]::text[];
BEGIN
  -- Count missing deductions using canonical view
  SELECT COUNT(*)
  INTO v_missing_count
  FROM v_delivered_order_lines dol
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_movements sm
    WHERE sm.reference_id = dol.order_id
      AND sm.product_id = dol.product_id
      AND sm.movement_type = 'SALE_DEDUCT'
  );
  
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', true,
      'missing_deductions', v_missing_count,
      'fixed_deductions', 0,
      'queue_cleared', 0,
      'errors', v_errors,
      'fixed_orders', v_fixed_orders
    );
  END IF;
  
  -- Create CTE for owner warehouses
  WITH owner_warehouses AS (
    SELECT DISTINCT ON (w.owner_user_id)
      w.owner_user_id,
      w.id as warehouse_id
    FROM warehouses w
    WHERE w.is_active = true
    ORDER BY w.owner_user_id, w.created_at DESC
  ),
  missing_deductions AS (
    SELECT 
      dol.order_id,
      dol.order_code,
      dol.order_item_id,
      dol.product_id,
      dol.qty_delivered,
      dol.owner_user_id as product_owner_id,
      ow.warehouse_id
    FROM v_delivered_order_lines dol
    LEFT JOIN owner_warehouses ow ON ow.owner_user_id = dol.owner_user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM stock_movements sm
      WHERE sm.reference_id = dol.order_id
        AND sm.product_id = dol.product_id
        AND sm.movement_type = 'SALE_DEDUCT'
    )
    AND ow.warehouse_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO stock_movements (
      warehouse_id,
      product_id,
      movement_type,
      qty_change,
      reference_type,
      reference_id,
      created_by
    )
    SELECT 
      md.warehouse_id,
      md.product_id,
      'SALE_DEDUCT'::movement_type,
      -md.qty_delivered,
      'ORDER_ITEM'::reference_type,  -- CORRECT: Use ORDER_ITEM not ORDER
      md.order_id,
      '00000000-0000-0000-0000-000000000000'::uuid
    FROM missing_deductions md
    ON CONFLICT (warehouse_id, product_id, reference_id) 
      WHERE movement_type = 'SALE_DEDUCT' AND reference_id IS NOT NULL
    DO NOTHING
    RETURNING reference_id
  )
  SELECT COUNT(*), array_agg(DISTINCT reference_id::text)
  INTO v_fixed_count, v_fixed_orders
  FROM inserted;
  
  -- Clear stale queue items for orders that are now processed
  WITH cleared AS (
    UPDATE delivery_queue dq
    SET status = 'REPROCESSED', processed_at = now()
    WHERE dq.status IN ('pending', 'PENDING', 'failed', 'FAILED')
      AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = dq.order_id
          AND o.runner_status = 'DELIVERED'
          AND lower(o.status::text) != 'cancelled'
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_queue_cleared FROM cleared;
  
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', false,
    'missing_deductions', v_missing_count,
    'fixed_deductions', COALESCE(v_fixed_count, 0),
    'queue_cleared', v_queue_cleared,
    'errors', v_errors,
    'fixed_orders', COALESCE(v_fixed_orders, ARRAY[]::text[])
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'dry_run', p_dry_run,
    'missing_deductions', v_missing_count,
    'fixed_deductions', 0,
    'queue_cleared', 0,
    'errors', ARRAY[SQLERRM],
    'fixed_orders', ARRAY[]::text[]
  );
END;
$$;

-- Also fix apply_full_stock_rebuild to use correct enum values
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
BEGIN
  -- First, run quick repair to fix missing deductions
  IF NOT p_dry_run THEN
    DECLARE
      v_repair_result jsonb;
    BEGIN
      SELECT repair_missing_stock_deductions(false) INTO v_repair_result;
      v_fixed_deductions := COALESCE((v_repair_result->>'fixed_deductions')::integer, 0);
    END;
  END IF;
  
  -- Get summary from full audit
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
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'dry_run', p_dry_run,
    'total_skus_scanned', 0,
    'ok_count', 0,
    'mismatch_count', 0,
    'negative_count', 0,
    'missing_deductions_fixed', 0,
    'error', SQLERRM
  );
END;
$$;