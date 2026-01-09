-- =====================================================
-- PART 2: Fix and recreate functions, views, and RLS policies
-- =====================================================

-- 1. Drop and recreate can_view_stock with correct parameter names
DROP FUNCTION IF EXISTS public.can_view_stock(uuid, uuid) CASCADE;

CREATE FUNCTION public.can_view_stock(owner_id uuid, viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Same user (owner viewing own stock)
    viewer_id = owner_id
    OR
    -- Admin can view all
    get_user_role(viewer_id) = 'admin'
    OR
    -- Manager can view members in their group
    (
      get_user_role(viewer_id) = 'manager'
      AND EXISTS (
        SELECT 1 FROM public.manager_groups mg
        JOIN public.group_members gm ON gm.group_id = mg.id
        WHERE mg.manager_user_id = viewer_id
        AND gm.member_user_id = owner_id
      )
    )
    OR
    -- Explicit visibility override granted
    EXISTS (
      SELECT 1 FROM public.stock_visibility_overrides svo
      WHERE svo.viewer_user_id = viewer_id
      AND svo.owner_user_id = owner_id
      AND svo.can_view = true
    )
    OR
    -- Runner can view bound salesperson stock
    (
      get_user_role(viewer_id) = 'runner'
      AND EXISTS (
        SELECT 1 FROM public.bindings b
        WHERE b.runner_id = viewer_id
        AND b.salesperson_id = owner_id
        AND b.active = true
      )
    )
$$;

-- 2. Recreate stock_balance_view with proper visibility filtering
DROP VIEW IF EXISTS stock_balance_view CASCADE;
CREATE VIEW stock_balance_view AS
SELECT 
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p_owner.display_name AS owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  SUM(sm.qty_change) AS balance_qty,
  MAX(sm.created_at) AS last_movement_time
FROM stock_movements sm
JOIN warehouses w ON w.id = sm.warehouse_id
LEFT JOIN profiles p_owner ON p_owner.id = w.owner_user_id
LEFT JOIN products pr ON pr.id = sm.product_id
WHERE can_view_stock(w.owner_user_id, auth.uid())
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING SUM(sm.qty_change) != 0;

-- 3. Create helper function for idempotent delivery deduction
CREATE OR REPLACE FUNCTION public.create_delivery_deduction(
  p_order_id uuid,
  p_warehouse_id uuid,
  p_product_id uuid,
  p_qty integer,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if already exists (idempotent)
  IF EXISTS (
    SELECT 1 FROM stock_movements 
    WHERE order_id = p_order_id 
    AND product_id = p_product_id 
    AND movement_type = 'DELIVER_DEDUCT'
  ) THEN
    RETURN false; -- Already deducted
  END IF;
  
  -- Create the deduction
  INSERT INTO stock_movements (
    warehouse_id, product_id, movement_type, qty_change, 
    reference_type, order_id, created_by
  ) VALUES (
    p_warehouse_id, p_product_id, 'DELIVER_DEDUCT', -p_qty,
    'ORDER', p_order_id, p_actor_id
  );
  
  RETURN true;
END;
$$;

-- 4. Create helper function for idempotent return to owner
CREATE OR REPLACE FUNCTION public.create_return_to_owner(
  p_order_id uuid,
  p_warehouse_id uuid,
  p_product_id uuid,
  p_qty integer,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if already exists (idempotent)
  IF EXISTS (
    SELECT 1 FROM stock_movements 
    WHERE order_id = p_order_id 
    AND product_id = p_product_id 
    AND movement_type = 'RETURN_TO_OWNER'
  ) THEN
    RETURN false; -- Already returned
  END IF;
  
  -- Only return if there was a deduction
  IF NOT EXISTS (
    SELECT 1 FROM stock_movements 
    WHERE order_id = p_order_id 
    AND product_id = p_product_id 
    AND movement_type = 'DELIVER_DEDUCT'
  ) THEN
    RETURN false; -- No deduction to reverse
  END IF;
  
  -- Create the return
  INSERT INTO stock_movements (
    warehouse_id, product_id, movement_type, qty_change, 
    reference_type, order_id, created_by
  ) VALUES (
    p_warehouse_id, p_product_id, 'RETURN_TO_OWNER', p_qty,
    'ORDER', p_order_id, p_actor_id
  );
  
  RETURN true;
END;
$$;

-- 5. Update stock_movements RLS to allow runners/drivers to insert
DROP POLICY IF EXISTS "Create stock movements for authorized users" ON stock_movements;
CREATE POLICY "Create stock movements for authorized users"
ON stock_movements FOR INSERT
WITH CHECK (
  auth.uid() = created_by 
  AND get_user_role(auth.uid()) IN ('salesperson', 'admin', 'runner', 'driver')
);

-- 6. Create policy to view stock movements with visibility rules
DROP POLICY IF EXISTS "Authenticated users can view stock movements" ON stock_movements;
CREATE POLICY "View stock movements with visibility rules"
ON stock_movements FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    get_user_role(auth.uid()) = 'admin'
    OR EXISTS (
      SELECT 1 FROM warehouses w
      WHERE w.id = stock_movements.warehouse_id
      AND can_view_stock(w.owner_user_id, auth.uid())
    )
  )
);

-- 7. Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION public.create_delivery_deduction TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_return_to_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_stock TO authenticated;