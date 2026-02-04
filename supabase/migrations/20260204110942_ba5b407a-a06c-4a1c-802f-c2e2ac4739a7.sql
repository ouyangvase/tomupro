-- Fix enum case: order_status uses lowercase 'delivered' not 'DELIVERED'

CREATE OR REPLACE FUNCTION repair_missing_stock_deductions(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing_count integer := 0;
  v_fixed_count integer := 0;
  v_result jsonb;
BEGIN
  -- Find delivered orders missing SALE_DEDUCT movements and fix them
  IF p_dry_run THEN
    -- Just count missing deductions
    SELECT COUNT(DISTINCT oi.id) INTO v_missing_count
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    WHERE o.status = 'delivered'
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements sm
        WHERE sm.reference_id = o.id
          AND sm.product_id = oi.product_id
          AND sm.movement_type = 'SALE_DEDUCT'
      );
    
    v_result := jsonb_build_object(
      'dry_run', true,
      'missing_deductions', v_missing_count,
      'fixed_count', 0
    );
  ELSE
    -- Actually insert missing deductions
    WITH missing_deductions AS (
      SELECT 
        oi.id as order_item_id,
        o.id as order_id,
        oi.product_id,
        oi.qty,
        p.owner_user_id as product_owner_id,
        o.delivered_at
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.status = 'delivered'
        AND oi.product_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements sm
          WHERE sm.reference_id = o.id
            AND sm.product_id = oi.product_id
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
        qty,
        reference_id,
        note,
        created_by,
        created_at
      )
      SELECT 
        COALESCE(ow.warehouse_id, (SELECT id FROM warehouses WHERE is_active = true LIMIT 1)),
        md.product_id,
        'SALE_DEDUCT',
        -md.qty,
        md.order_id,
        'Auto-repair: Missing SALE_DEDUCT for delivered order',
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
    SELECT COUNT(DISTINCT oi.id) INTO v_missing_count
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    WHERE o.status = 'delivered'
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements sm
        WHERE sm.reference_id = o.id
          AND sm.product_id = oi.product_id
          AND sm.movement_type = 'SALE_DEDUCT'
      );
    
    -- Clear stale delivery queue items
    UPDATE delivery_queue
    SET status = 'REPROCESSED', processed_at = now()
    WHERE status IN ('PENDING', 'FAILED')
      AND order_id IN (SELECT id FROM orders WHERE status = 'delivered');
    
    v_result := jsonb_build_object(
      'dry_run', false,
      'missing_deductions', v_missing_count,
      'fixed_count', v_fixed_count
    );
  END IF;
  
  RETURN v_result;
END;
$$;