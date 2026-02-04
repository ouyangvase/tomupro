
-- =============================================
-- FIX STOCK INTEGRITY: Use runner_status for delivery tracking
-- =============================================

-- A) Create canonical view for delivered order lines
-- This is THE single source of truth for what counts as "delivered"
CREATE OR REPLACE VIEW v_delivered_order_lines AS
SELECT 
  o.id as order_id,
  o.order_code,
  o.salesperson_id as owner_id,
  p.owner_user_id as product_owner_id,
  o.delivered_at,
  oi.id as order_item_id,
  oi.product_id,
  p.sku_code,
  p.sku_name,
  oi.qty as qty_delivered,
  oi.price,
  oi.line_total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE o.runner_status = 'DELIVERED'
  AND o.status != 'CANCELLED';

-- B) Fix repair_missing_stock_deductions to use runner_status
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
  v_result jsonb;
BEGIN
  -- Find delivered orders (via runner_status) missing SALE_DEDUCT movements
  IF p_dry_run THEN
    -- Just count missing deductions using canonical view
    SELECT COUNT(DISTINCT vd.order_item_id) INTO v_missing_count
    FROM v_delivered_order_lines vd
    WHERE NOT EXISTS (
      SELECT 1 FROM stock_movements sm
      WHERE sm.reference_id = vd.order_id
        AND sm.product_id = vd.product_id
        AND sm.movement_type = 'SALE_DEDUCT'
    );
    
    v_result := jsonb_build_object(
      'success', true,
      'dry_run', true,
      'missing_deductions', v_missing_count,
      'fixed_deductions', 0,
      'queue_cleared', 0,
      'errors', '[]'::jsonb,
      'fixed_orders', '[]'::jsonb
    );
  ELSE
    -- Actually insert missing deductions using canonical view
    WITH missing_deductions AS (
      SELECT DISTINCT
        vd.order_item_id,
        vd.order_id,
        vd.product_id,
        vd.qty_delivered,
        vd.product_owner_id,
        vd.delivered_at
      FROM v_delivered_order_lines vd
      WHERE vd.product_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements sm
          WHERE sm.reference_id = vd.order_id
            AND sm.product_id = vd.product_id
            AND sm.movement_type = 'SALE_DEDUCT'
        )
    ),
    owner_warehouses AS (
      SELECT DISTINCT ON (owner_user_id)
        owner_user_id,
        id as warehouse_id
      FROM warehouses
      WHERE is_active = true
      ORDER BY owner_user_id, created_at ASC
    ),
    inserted AS (
      INSERT INTO stock_movements (
        warehouse_id,
        product_id,
        movement_type,
        qty_change,
        reference_type,
        reference_id,
        order_id,
        unique_key,
        created_by,
        created_at
      )
      SELECT 
        COALESCE(ow.warehouse_id, (SELECT id FROM warehouses WHERE is_active = true LIMIT 1)),
        md.product_id,
        'SALE_DEDUCT',
        -md.qty_delivered,
        'ORDER',
        md.order_id,
        md.order_id,
        'SALE_DEDUCT:' || md.order_id || ':' || md.product_id,
        NULL,
        COALESCE(md.delivered_at, now())
      FROM missing_deductions md
      LEFT JOIN owner_warehouses ow ON ow.owner_user_id = md.product_owner_id
      ON CONFLICT (warehouse_id, product_id, reference_id) 
        WHERE movement_type = 'SALE_DEDUCT' AND reference_id IS NOT NULL
      DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*) INTO v_fixed_count FROM inserted;
    
    -- Get remaining missing count for comparison
    SELECT COUNT(DISTINCT vd.order_item_id) INTO v_missing_count
    FROM v_delivered_order_lines vd
    WHERE NOT EXISTS (
      SELECT 1 FROM stock_movements sm
      WHERE sm.reference_id = vd.order_id
        AND sm.product_id = vd.product_id
        AND sm.movement_type = 'SALE_DEDUCT'
    );
    
    -- Clear stale delivery queue items for already-delivered orders
    WITH cleared AS (
      UPDATE delivery_queue
      SET status = 'REPROCESSED', processed_at = now()
      WHERE status IN ('PENDING', 'FAILED')
        AND order_id IN (SELECT DISTINCT order_id FROM v_delivered_order_lines)
      RETURNING id
    )
    SELECT COUNT(*) INTO v_queue_cleared FROM cleared;
    
    v_result := jsonb_build_object(
      'success', true,
      'dry_run', false,
      'missing_deductions', v_missing_count,
      'fixed_deductions', v_fixed_count,
      'queue_cleared', v_queue_cleared,
      'errors', '[]'::jsonb,
      'fixed_orders', '[]'::jsonb
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- C) Update full_stock_integrity_audit to ensure delivered qty matches canonical source
-- The current function already uses stock_movements which is correct
-- But let's add a debug function to compare

CREATE OR REPLACE FUNCTION debug_delivered_qty_comparison(p_sku_code text DEFAULT 'AKO02')
RETURNS TABLE(
  sku_code text,
  delivered_from_orders bigint,
  delivered_from_movements bigint,
  difference bigint,
  match_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH orders_delivered AS (
    SELECT 
      vd.sku_code as sku,
      SUM(vd.qty_delivered) as qty
    FROM v_delivered_order_lines vd
    WHERE p_sku_code IS NULL OR vd.sku_code = p_sku_code
    GROUP BY vd.sku_code
  ),
  movements_delivered AS (
    SELECT
      p.sku_code as sku,
      SUM(ABS(sm.qty_change)) as qty
    FROM stock_movements sm
    JOIN products p ON p.id = sm.product_id
    WHERE sm.movement_type = 'SALE_DEDUCT'
      AND (p_sku_code IS NULL OR p.sku_code = p_sku_code)
    GROUP BY p.sku_code
  )
  SELECT
    COALESCE(od.sku, md.sku) as sku_code,
    COALESCE(od.qty, 0)::bigint as delivered_from_orders,
    COALESCE(md.qty, 0)::bigint as delivered_from_movements,
    (COALESCE(md.qty, 0) - COALESCE(od.qty, 0))::bigint as difference,
    CASE 
      WHEN COALESCE(od.qty, 0) = COALESCE(md.qty, 0) THEN 'MATCH'
      ELSE 'MISMATCH'
    END as match_status
  FROM orders_delivered od
  FULL OUTER JOIN movements_delivered md ON md.sku = od.sku
  ORDER BY COALESCE(od.sku, md.sku);
END;
$$;

-- D) Create function to get rebuild summary with debug info
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
  v_delivered_lines bigint := 0;
  v_sample_debug jsonb;
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
  
  -- Count total delivered lines from canonical view
  SELECT COUNT(*) INTO v_delivered_lines FROM v_delivered_order_lines;
  
  -- Get debug comparison for AKO02 sample
  SELECT jsonb_agg(row_to_json(d))
  INTO v_sample_debug
  FROM debug_delivered_qty_comparison('AKO02') d;
  
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'total_skus_scanned', v_total_skus,
    'ok_count', v_ok_count,
    'mismatch_count', v_mismatch_count,
    'negative_count', v_negative_count,
    'missing_deductions_fixed', v_fixed_deductions,
    'total_delivered_lines', v_delivered_lines,
    'sample_sku_debug', COALESCE(v_sample_debug, '[]'::jsonb)
  );
END;
$$;
