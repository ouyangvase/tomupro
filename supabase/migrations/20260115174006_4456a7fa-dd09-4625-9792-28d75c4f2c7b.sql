-- Performance indexes for orders queries
-- Index for runner delivered orders (most critical query)
CREATE INDEX IF NOT EXISTS idx_orders_runner_status_delivered 
ON public.orders (runner_id, runner_status, delivered_at DESC)
WHERE runner_status = 'DELIVERED';

-- Index for runner inbox queries
CREATE INDEX IF NOT EXISTS idx_orders_runner_id_status 
ON public.orders (runner_id, status);

-- General runner_status + delivered_at for sorting
CREATE INDEX IF NOT EXISTS idx_orders_runner_status_delivered_at 
ON public.orders (runner_status, delivered_at DESC);

-- Index for salesperson orders
CREATE INDEX IF NOT EXISTS idx_orders_salesperson_status 
ON public.orders (salesperson_id, status);

-- Index for order_items by order_id (speeds up joins)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
ON public.order_items (order_id);

-- Index for stock_movements lookup by source
CREATE INDEX IF NOT EXISTS idx_stock_movements_source 
ON public.stock_movements (reference_type, reference_id);

-- Index for stock_movements by order
CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id 
ON public.stock_movements (order_id) WHERE order_id IS NOT NULL;

-- Index for claims by order
CREATE INDEX IF NOT EXISTS idx_claims_order_id 
ON public.claims (order_id);

-- Index for reconciliation status filtering
CREATE INDEX IF NOT EXISTS idx_orders_reconciliation_status 
ON public.orders (reconciliation_status);

-- Index for created_at ordering (often used in default sorts)
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc 
ON public.orders (created_at DESC);

-- ============================================================
-- Create optimized function for delivered orders
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_delivered_orders_fast(
  p_runner_id UUID DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,
  p_salesperson_ids UUID[] DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  order_code TEXT,
  order_date DATE,
  customer_name TEXT,
  phone TEXT,
  area TEXT,
  address TEXT,
  total_amount NUMERIC,
  total_qty INT,
  payment_method TEXT,
  runner_status TEXT,
  reconciliation_status TEXT,
  delivered_at TIMESTAMPTZ,
  salesperson_id UUID,
  salesperson_name TEXT,
  runner_id UUID,
  runner_name TEXT,
  driver_id UUID,
  driver_name TEXT,
  items_summary TEXT,
  items_json JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.order_code,
    o.order_date,
    o.customer_name,
    o.phone,
    o.area,
    o.address,
    o.total_amount,
    o.total_qty,
    o.payment_method::TEXT,
    o.runner_status::TEXT,
    o.reconciliation_status::TEXT,
    o.delivered_at,
    o.salesperson_id,
    sp.display_name AS salesperson_name,
    o.runner_id,
    rn.display_name AS runner_name,
    o.driver_id,
    dr.display_name AS driver_name,
    COALESCE(
      (SELECT string_agg(
        COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::TEXT, 
        ', '
      )
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id),
      'No items'
    ) AS items_summary,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'product_id', oi.product_id,
        'sku_code', p.sku_code,
        'sku_name', p.sku_name,
        'sku_label', oi.sku_label,
        'qty', oi.qty,
        'price', oi.price,
        'line_total', oi.line_total
      ))
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id),
      '[]'::JSONB
    ) AS items_json
  FROM orders o
  LEFT JOIN profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN profiles rn ON rn.id = o.runner_id
  LEFT JOIN profiles dr ON dr.id = o.driver_id
  WHERE 
    o.runner_status = 'DELIVERED'
    AND o.status != 'CANCELLED'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
  ORDER BY o.delivered_at DESC NULLS LAST, o.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast TO authenticated;

-- ============================================================
-- Create summary function for delivered orders stats
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_delivered_summary(
  p_runner_id UUID DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,
  p_salesperson_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  total_delivered BIGINT,
  pending_claim BIGINT,
  total_amount NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT AS total_delivered,
    COUNT(*) FILTER (WHERE o.reconciliation_status = 'NOT_CLAIMED')::BIGINT AS pending_claim,
    COALESCE(SUM(o.total_amount), 0)::NUMERIC AS total_amount
  FROM orders o
  WHERE 
    o.runner_status = 'DELIVERED'
    AND o.status != 'CANCELLED'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_delivered_summary TO authenticated;

-- ============================================================
-- Create delivery queue table for async processing
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING',
  error_message TEXT,
  retry_count INT DEFAULT 0,
  UNIQUE(order_id)
);

ALTER TABLE public.delivery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to delivery_queue"
ON public.delivery_queue FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_delivery_queue_pending 
ON public.delivery_queue (status, queued_at)
WHERE status = 'PENDING';

-- ============================================================
-- Create fast delivery update function (UI-blocking part only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_order_delivered_fast(
  p_order_id UUID,
  p_actor_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT id, runner_id, runner_status, stock_deducted
  INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE SKIP LOCKED;
  
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or locked');
  END IF;
  
  IF v_order.runner_id != p_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  IF v_order.runner_status = 'DELIVERED' THEN
    RETURN jsonb_build_object('success', true, 'already_delivered', true);
  END IF;
  
  UPDATE orders
  SET 
    runner_status = 'DELIVERED',
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;
  
  INSERT INTO public.delivery_queue (order_id, queued_at, status)
  VALUES (p_order_id, NOW(), 'PENDING')
  ON CONFLICT (order_id) DO NOTHING;
  
  RETURN jsonb_build_object(
    'success', true,
    'delivered_at', NOW(),
    'queued_for_processing', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_delivered_fast TO authenticated;

-- ============================================================
-- Create trigger to process delivery queue (immediate processing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_delivery_queue_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_warehouse_id UUID;
  v_item RECORD;
  v_missing_items TEXT[];
BEGIN
  SELECT o.id, o.salesperson_id, o.runner_id, o.order_code, o.fulfillment_warehouse_id, o.stock_deducted
  INTO v_order
  FROM orders o
  WHERE o.id = NEW.order_id;
  
  IF v_order IS NULL THEN
    UPDATE delivery_queue SET status = 'FAILED', error_message = 'Order not found', processed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;
  
  IF v_order.stock_deducted THEN
    UPDATE delivery_queue SET status = 'COMPLETED', processed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;
  
  v_warehouse_id := v_order.fulfillment_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
    FROM warehouses
    WHERE owner_user_id = v_order.salesperson_id
      AND warehouse_type IN ('SALESPERSON', 'MANAGER')
      AND is_active = true
    LIMIT 1;
  END IF;
  
  IF v_warehouse_id IS NULL THEN
    UPDATE delivery_queue SET status = 'FAILED', error_message = 'No warehouse found', processed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;
  
  SELECT array_agg(COALESCE(sku_label, 'Unknown'))
  INTO v_missing_items
  FROM order_items
  WHERE order_id = NEW.order_id AND product_id IS NULL;
  
  IF array_length(v_missing_items, 1) > 0 THEN
    UPDATE orders SET
      reconciliation_status = 'DISPUTE',
      dispute_reason = 'Missing SKU mapping',
      dispute_notes = 'Missing SKU: ' || array_to_string(v_missing_items, ', ')
    WHERE id = NEW.order_id;
    
    UPDATE delivery_queue SET status = 'DISPUTE', error_message = 'Missing SKU mapping', processed_at = NOW()
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;
  
  FOR v_item IN 
    SELECT id, product_id, qty FROM order_items WHERE order_id = NEW.order_id AND product_id IS NOT NULL
  LOOP
    INSERT INTO stock_movements (
      warehouse_id, product_id, movement_type, qty_change, 
      reference_type, reference_id, order_id, created_by
    )
    VALUES (
      v_warehouse_id, v_item.product_id, 'DELIVER_DEDUCT', -v_item.qty,
      'ORDER_ITEM', v_item.id, NEW.order_id, v_order.runner_id
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
  
  UPDATE orders SET 
    stock_deducted = true,
    inventory_deducted_at = NOW(),
    fulfillment_warehouse_id = v_warehouse_id
  WHERE id = NEW.order_id;
  
  UPDATE delivery_queue SET status = 'COMPLETED', processed_at = NOW()
  WHERE id = NEW.id;
  
  INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
  VALUES (
    v_order.salesperson_id, 
    'DELIVERED', 
    'Order Delivered',
    'Order ' || v_order.order_code || ' delivered. Stock deducted.',
    'ORDER',
    NEW.order_id
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_delivery_queue ON public.delivery_queue;
CREATE TRIGGER trg_process_delivery_queue
AFTER INSERT ON public.delivery_queue
FOR EACH ROW
EXECUTE FUNCTION public.process_delivery_queue_item();