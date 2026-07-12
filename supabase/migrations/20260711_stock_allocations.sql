-- Stock Allocations: FIFO-based stock reservation for BOOKING & READY orders
-- This table stores per-order-item allocation results (not stock_movements — allocations are temporary)

-- 1. stock_allocations table
CREATE TABLE IF NOT EXISTS stock_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid REFERENCES warehouses(id),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  qty_required int NOT NULL,
  qty_allocated int NOT NULL DEFAULT 0,
  qty_shortage int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  calculated_by uuid REFERENCES auth.users(id),
  UNIQUE(order_item_id)
);

-- 2. Add columns to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stock_status text DEFAULT 'NOT_CALCULATED',
  ADD COLUMN IF NOT EXISTS stock_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_calculated_by uuid REFERENCES auth.users(id);

-- 3. RPC: calculate_stock_for_orders
CREATE OR REPLACE FUNCTION calculate_stock_for_orders(p_order_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_available int;
  v_allocate int;
  v_order_status text;
  v_all_fulfilled boolean;
  v_any_allocated boolean;
  v_has_items boolean;
  v_results jsonb := '[]'::jsonb;
  v_balance_key text;
  v_running_balance jsonb := '{}'::jsonb;
BEGIN
  -- Delete existing allocations for these orders
  DELETE FROM stock_allocations WHERE order_id = ANY(p_order_ids);

  -- Process orders in FIFO order (oldest first)
  FOR v_order IN
    SELECT o.id, o.fulfillment_warehouse_id, o.salesperson_id
    FROM orders o
    WHERE o.id = ANY(p_order_ids)
      AND o.status IN ('BOOKING', 'READY')
    ORDER BY o.created_at ASC
  LOOP
    v_all_fulfilled := true;
    v_any_allocated := false;
    v_has_items := false;

    FOR v_item IN
      SELECT oi.id AS item_id, oi.product_id, oi.qty
      FROM order_items oi
      WHERE oi.order_id = v_order.id
        AND oi.product_id IS NOT NULL
    LOOP
      v_has_items := true;

      -- Build balance key: warehouse + owner + product
      v_balance_key := COALESCE(v_order.fulfillment_warehouse_id::text, 'null')
        || ':' || COALESCE(v_order.salesperson_id::text, 'null')
        || ':' || v_item.product_id::text;

      -- Get available from running balance (initialized from DB on first access)
      IF NOT v_running_balance ? v_balance_key THEN
        SELECT COALESCE(balance_qty, 0) INTO v_available
        FROM v_stock_balance_computed
        WHERE product_id = v_item.product_id
          AND warehouse_id IS NOT DISTINCT FROM v_order.fulfillment_warehouse_id
          AND owner_user_id = v_order.salesperson_id;
        IF v_available IS NULL THEN v_available := 0; END IF;
        v_running_balance := v_running_balance || jsonb_build_object(v_balance_key, v_available);
      ELSE
        v_available := (v_running_balance ->> v_balance_key)::int;
      END IF;

      -- Allocate
      v_allocate := LEAST(v_item.qty, GREATEST(v_available, 0));

      INSERT INTO stock_allocations (
        order_id, order_item_id, product_id, warehouse_id, owner_user_id,
        qty_required, qty_allocated, qty_shortage, calculated_by
      ) VALUES (
        v_order.id, v_item.item_id, v_item.product_id,
        v_order.fulfillment_warehouse_id, v_order.salesperson_id,
        v_item.qty, v_allocate, v_item.qty - v_allocate,
        auth.uid()
      );

      -- Update running balance
      v_running_balance := v_running_balance || jsonb_build_object(
        v_balance_key, v_available - v_allocate
      );

      IF v_allocate < v_item.qty THEN v_all_fulfilled := false; END IF;
      IF v_allocate > 0 THEN v_any_allocated := true; END IF;
    END LOOP;

    -- Determine order stock status
    IF NOT v_has_items THEN
      v_order_status := 'STOCK_READY';
    ELSIF v_all_fulfilled THEN
      v_order_status := 'STOCK_READY';
    ELSIF v_any_allocated THEN
      v_order_status := 'PARTIAL_STOCK';
    ELSE
      v_order_status := 'OUT_OF_STOCK';
    END IF;

    -- Update order
    UPDATE orders SET
      stock_status = v_order_status,
      stock_calculated_at = now(),
      stock_calculated_by = auth.uid()
    WHERE id = v_order.id;

    v_results := v_results || jsonb_build_object(
      'order_id', v_order.id,
      'stock_status', v_order_status
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'results', v_results, 'count', jsonb_array_length(v_results));
END;
$$;

-- 4. RLS policies
ALTER TABLE stock_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with relevant roles can read allocations"
  ON stock_allocations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'runner', 'salesperson')
    )
  );

CREATE POLICY "Admins and managers can manage allocations"
  ON stock_allocations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_stock_allocations_order ON stock_allocations(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_allocations_product ON stock_allocations(product_id, warehouse_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_stock_status ON orders(stock_status) WHERE status IN ('BOOKING', 'READY');
