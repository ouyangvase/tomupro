
-- INVENTORY NORMALIZATION: Single Source of Truth
-- Stock belongs ONLY to salesperson/admin (stock owners), never runners/drivers

-- ================================================
-- STEP 1: Drop the trigger first, then function (CASCADE)
-- ================================================
DROP TRIGGER IF EXISTS trigger_prededuct_on_driver_assign ON public.orders;
DROP TRIGGER IF EXISTS trigger_prededuct_stock_on_driver_assign ON public.orders;
DROP FUNCTION IF EXISTS public.prededuct_stock_on_driver_assign() CASCADE;

-- ================================================
-- STEP 2: Create enforcement function - block runner/driver stock mutations
-- ================================================
CREATE OR REPLACE FUNCTION public.enforce_stock_owner_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_owner_role app_role;
BEGIN
  -- Get the role of the warehouse owner
  SELECT p.role INTO v_warehouse_owner_role
  FROM warehouses w
  JOIN profiles p ON p.id = w.owner_user_id
  WHERE w.id = NEW.warehouse_id;
  
  -- Block if warehouse belongs to runner or driver
  IF v_warehouse_owner_role IN ('runner', 'driver') THEN
    -- Log the blocked attempt
    INSERT INTO inventory_data_issues (
      warehouse_id, product_id, issue_type, balance_qty, details
    ) VALUES (
      NEW.warehouse_id,
      NEW.product_id,
      'BLOCKED_MUTATION',
      NEW.qty_change,
      jsonb_build_object(
        'movement_type', NEW.movement_type,
        'order_id', NEW.order_id,
        'actor_id', NEW.created_by,
        'reason', 'Stock mutations not allowed in runner/driver warehouses'
      )
    );
    
    RAISE EXCEPTION 'Stock mutations not allowed in runner/driver warehouses. Stock belongs to salesperson/admin only.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the enforcement trigger
DROP TRIGGER IF EXISTS trigger_enforce_stock_owner ON public.stock_movements;
CREATE TRIGGER trigger_enforce_stock_owner
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_stock_owner_only();

-- ================================================
-- STEP 3: Update stock_balance_view to ONLY show salesperson/admin stock
-- ================================================
DROP VIEW IF EXISTS public.stock_balance_view CASCADE;

CREATE VIEW public.stock_balance_view AS
SELECT 
  sm.warehouse_id,
  w.name as warehouse_name,
  w.owner_user_id,
  p.display_name as owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  SUM(sm.qty_change)::bigint as balance_qty,
  MAX(sm.created_at) as last_movement_time
FROM stock_movements sm
INNER JOIN warehouses w ON w.id = sm.warehouse_id
INNER JOIN profiles p ON p.id = w.owner_user_id
INNER JOIN products pr ON pr.id = sm.product_id
WHERE sm.product_id IS NOT NULL
  AND pr.sku_code IS NOT NULL
  -- CRITICAL: Only show salesperson and admin owned stock
  AND p.role IN ('salesperson', 'admin')
GROUP BY 
  sm.warehouse_id, 
  w.name, 
  w.owner_user_id, 
  p.display_name, 
  sm.product_id, 
  pr.sku_code, 
  pr.sku_name
HAVING SUM(sm.qty_change) != 0;

-- ================================================
-- STEP 4: Update get_stock_balance function to match
-- ================================================
CREATE OR REPLACE FUNCTION public.get_stock_balance()
RETURNS TABLE (
  warehouse_id uuid,
  warehouse_name text,
  owner_user_id uuid,
  owner_name text,
  product_id uuid,
  sku_code text,
  sku_name text,
  balance_qty bigint,
  last_movement_time timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    sbv.warehouse_id,
    sbv.warehouse_name,
    sbv.owner_user_id,
    sbv.owner_name,
    sbv.product_id,
    sbv.sku_code,
    sbv.sku_name,
    sbv.balance_qty,
    sbv.last_movement_time
  FROM stock_balance_view sbv
  INNER JOIN warehouses w ON w.id = sbv.warehouse_id
  WHERE can_view_stock(w.owner_user_id, auth.uid())
  ORDER BY sbv.owner_name, sbv.sku_code NULLS LAST;
$$;

-- ================================================
-- STEP 5: Create helper function to get salesperson warehouse
-- ================================================
CREATE OR REPLACE FUNCTION public.get_stock_owner_warehouse(p_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Always return the salesperson's warehouse for stock operations
  SELECT w.id
  FROM orders o
  JOIN warehouses w ON w.owner_user_id = o.salesperson_id
  WHERE o.id = p_order_id
    AND w.warehouse_type = 'SALESPERSON'
    AND w.is_active = true
  LIMIT 1;
$$;

-- Add audit log for this cleanup (entity_id is UUID type)
INSERT INTO audit_logs (entity_type, entity_id, action, after_json)
VALUES (
  'SYSTEM',
  gen_random_uuid(),
  'INVENTORY_MODEL_NORMALIZED',
  jsonb_build_object(
    'date', now(),
    'changes', ARRAY[
      'Added enforcement trigger to block future runner/driver stock',
      'Updated stock_balance_view to only show salesperson/admin stock',
      'Removed DRIVER_PICKUP pre-deduction trigger',
      'All stock now belongs to salesperson (stock_owner) only'
    ]
  )
);
