-- Part 1: Add Missing Index for Product Lookup
CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
ON order_items(product_id);

-- Part 2: Add Composite Index for Runner Queries
CREATE INDEX IF NOT EXISTS idx_orders_runner_created_desc
ON orders(runner_id, created_at DESC)
WHERE runner_id IS NOT NULL;

-- Part 3: Create optimized security definer function for order_items access
CREATE OR REPLACE FUNCTION public.can_access_order_items(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id
    AND (
      o.salesperson_id = auth.uid()
      OR o.runner_id = auth.uid()
      OR o.driver_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      OR (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager')
        AND (
          o.salesperson_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM manager_salesperson_bindings
            WHERE manager_id = auth.uid() AND salesperson_id = o.salesperson_id AND active = true
          )
        )
      )
    )
  );
$$;

-- Part 4: Drop existing inefficient RLS policies
DROP POLICY IF EXISTS "Order items follow order access" ON order_items;
DROP POLICY IF EXISTS "Manager can view team order items" ON order_items;

-- Part 5: Create simplified unified policy using the security definer function
CREATE POLICY "order_items_access" ON order_items
FOR ALL
USING (public.can_access_order_items(order_id));