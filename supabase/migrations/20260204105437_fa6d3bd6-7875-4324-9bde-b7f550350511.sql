-- Fix type casting in repair functions
CREATE OR REPLACE FUNCTION repair_missing_stock_deductions(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_count bigint := 0;
  v_fixed_count bigint := 0;
  v_queue_cleared bigint := 0;
  v_errors text[] := ARRAY[]::text[];
  v_fixed_orders text[] := ARRAY[]::text[];
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  
  -- Count missing deductions (compare text to text)
  SELECT COUNT(DISTINCT oi.id)
  INTO v_missing_count
  FROM orders o
  INNER JOIN order_items oi ON oi.order_id = o.id
  WHERE o.runner_status = 'DELIVERED'
    AND oi.product_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM stock_movements sm
      WHERE sm.reference_id = oi.id::text
        AND sm.movement_type = 'SALE_DEDUCT'
    );
  
  IF NOT p_dry_run AND v_missing_count > 0 THEN
    WITH delivered_items AS (
      SELECT 
        oi.id as order_item_id,
        oi.product_id,
        oi.qty,
        o.id as order_id,
        o.order_code,
        o.salesperson_id,
        COALESCE(
          get_stock_owner_warehouse(o.salesperson_id),
          (SELECT w.id FROM warehouses w WHERE w.owner_user_id = o.salesperson_id AND w.is_active = true LIMIT 1)
        ) as warehouse_id
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE o.runner_status = 'DELIVERED'
        AND oi.product_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements sm
          WHERE sm.reference_id = oi.id::text
            AND sm.movement_type = 'SALE_DEDUCT'
        )
    ),
    to_insert AS (
      SELECT DISTINCT ON (di.warehouse_id, di.product_id, di.order_item_id)
        di.warehouse_id,
        di.product_id,
        'SALE_DEDUCT'::movement_type as movement_type,
        -di.qty as qty_change,
        'ORDER_ITEM'::reference_type as reference_type,
        di.order_item_id::text as reference_id,
        v_admin_id as created_by
      FROM delivered_items di
      WHERE di.warehouse_id IS NOT NULL
    ),
    inserted AS (
      INSERT INTO stock_movements (
        warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by
      )
      SELECT ti.warehouse_id, ti.product_id, ti.movement_type, ti.qty_change, ti.reference_type, ti.reference_id, ti.created_by 
      FROM to_insert ti
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_movements sm 
        WHERE sm.warehouse_id = ti.warehouse_id 
          AND sm.product_id = ti.product_id 
          AND sm.reference_id = ti.reference_id
          AND sm.movement_type = 'SALE_DEDUCT'
      )
      RETURNING reference_id
    )
    SELECT COUNT(*) INTO v_fixed_count FROM inserted;
    
    -- Get fixed order codes
    SELECT ARRAY_AGG(DISTINCT o.order_code)
    INTO v_fixed_orders
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    INNER JOIN stock_movements sm ON sm.reference_id = oi.id::text
    WHERE sm.movement_type = 'SALE_DEDUCT' 
      AND sm.created_at > NOW() - INTERVAL '5 minutes';
    
    -- Mark orders as stock_deducted
    UPDATE orders o
    SET stock_deducted = true
    WHERE o.runner_status = 'DELIVERED'
      AND o.stock_deducted = false
      AND EXISTS (
        SELECT 1 FROM order_items oi
        INNER JOIN stock_movements sm ON sm.reference_id = oi.id::text
        WHERE oi.order_id = o.id AND sm.movement_type = 'SALE_DEDUCT'
      );
    
    -- Clear failed queue items
    UPDATE delivery_queue SET status = 'REPROCESSED', processed_at = NOW() WHERE status = 'FAILED';
    GET DIAGNOSTICS v_queue_cleared = ROW_COUNT;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'missing_deductions', v_missing_count,
    'fixed_deductions', v_fixed_count,
    'queue_cleared', v_queue_cleared,
    'errors', v_errors,
    'fixed_orders', COALESCE(v_fixed_orders, ARRAY[]::text[])
  );
END;
$$;

-- Also fix apply_full_stock_rebuild
CREATE OR REPLACE FUNCTION apply_full_stock_rebuild(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint := 0;
  v_ok bigint := 0;
  v_mismatch bigint := 0;
  v_negative bigint := 0;
  v_missing_deductions_fixed bigint := 0;
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE fsia.status = 'OK'),
    COUNT(*) FILTER (WHERE fsia.status = 'MISMATCH'),
    COUNT(*) FILTER (WHERE fsia.status = 'NEGATIVE')
  INTO v_total, v_ok, v_mismatch, v_negative
  FROM full_stock_integrity_audit(NULL, NULL) fsia;
  
  IF NOT p_dry_run THEN
    -- Fix missing deductions
    WITH delivered_items AS (
      SELECT 
        oi.id as order_item_id,
        oi.product_id,
        oi.qty,
        o.salesperson_id,
        COALESCE(
          get_stock_owner_warehouse(o.salesperson_id),
          (SELECT w.id FROM warehouses w WHERE w.owner_user_id = o.salesperson_id AND w.is_active = true LIMIT 1)
        ) as warehouse_id
      FROM orders o
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE o.runner_status = 'DELIVERED'
        AND oi.product_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements sm
          WHERE sm.reference_id = oi.id::text AND sm.movement_type = 'SALE_DEDUCT'
        )
    ),
    to_insert AS (
      SELECT DISTINCT ON (di.warehouse_id, di.product_id, di.order_item_id)
        di.warehouse_id, di.product_id,
        'SALE_DEDUCT'::movement_type as movement_type,
        -di.qty as qty_change,
        'ORDER_ITEM'::reference_type as reference_type,
        di.order_item_id::text as reference_id,
        v_admin_id as created_by
      FROM delivered_items di WHERE di.warehouse_id IS NOT NULL
    ),
    inserted_deductions AS (
      INSERT INTO stock_movements (warehouse_id, product_id, movement_type, qty_change, reference_type, reference_id, created_by)
      SELECT ti.warehouse_id, ti.product_id, ti.movement_type, ti.qty_change, ti.reference_type, ti.reference_id, ti.created_by
      FROM to_insert ti
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_movements sm 
        WHERE sm.warehouse_id = ti.warehouse_id AND sm.product_id = ti.product_id 
          AND sm.reference_id = ti.reference_id AND sm.movement_type = 'SALE_DEDUCT'
      )
      RETURNING id
    )
    SELECT COUNT(*) INTO v_missing_deductions_fixed FROM inserted_deductions;
    
    -- Mark orders as deducted
    UPDATE orders o SET stock_deducted = true
    WHERE o.runner_status = 'DELIVERED' AND o.stock_deducted = false
      AND EXISTS (
        SELECT 1 FROM order_items oi
        INNER JOIN stock_movements sm ON sm.reference_id = oi.id::text
        WHERE oi.order_id = o.id AND sm.movement_type = 'SALE_DEDUCT'
      );
    
    -- Clear failed queue
    UPDATE delivery_queue SET status = 'REPROCESSED', processed_at = NOW() WHERE status = 'FAILED';
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'total_skus_scanned', v_total,
    'ok_count', v_ok,
    'mismatch_count', v_mismatch,
    'negative_count', v_negative,
    'missing_deductions_fixed', v_missing_deductions_fixed
  );
END;
$$;