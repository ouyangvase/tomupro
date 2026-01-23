-- Fix 1: Update stock_balance_view to only show active warehouses
CREATE OR REPLACE VIEW stock_balance_view AS
SELECT 
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p.display_name AS owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  sum(sm.qty_change) AS balance_qty,
  max(sm.created_at) AS last_movement_time
FROM stock_movements sm
JOIN warehouses w ON w.id = sm.warehouse_id
JOIN profiles p ON p.id = w.owner_user_id
JOIN products pr ON pr.id = sm.product_id
WHERE sm.product_id IS NOT NULL 
  AND pr.sku_code IS NOT NULL 
  AND w.is_active = true  -- CRITICAL: Only show stock in active warehouses
  AND (p.role = ANY (ARRAY['salesperson'::app_role, 'manager'::app_role, 'admin'::app_role]))
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING sum(sm.qty_change) <> 0;

-- Fix 2: Migrate orphaned stock movements from inactive to active warehouses
WITH user_warehouse_pairs AS (
  SELECT 
    inactive.id AS inactive_warehouse_id,
    active.id AS active_warehouse_id,
    inactive.owner_user_id
  FROM warehouses inactive
  JOIN warehouses active ON active.owner_user_id = inactive.owner_user_id 
    AND active.is_active = true
  WHERE inactive.is_active = false
)
UPDATE stock_movements sm
SET warehouse_id = uwp.active_warehouse_id
FROM user_warehouse_pairs uwp
WHERE sm.warehouse_id = uwp.inactive_warehouse_id;

-- Fix 3: Update orders with stale fulfillment_warehouse_id references
UPDATE orders o
SET fulfillment_warehouse_id = w_active.id
FROM warehouses w_inactive
JOIN warehouses w_active ON w_active.owner_user_id = w_inactive.owner_user_id
  AND w_active.is_active = true
WHERE o.fulfillment_warehouse_id = w_inactive.id
  AND w_inactive.is_active = false;

-- Fix 4: Create trigger to prevent stock movements to inactive warehouses
CREATE OR REPLACE FUNCTION validate_stock_movement_warehouse()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM warehouses 
    WHERE id = NEW.warehouse_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create stock movement for inactive warehouse %', NEW.warehouse_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS check_stock_movement_warehouse ON stock_movements;
CREATE TRIGGER check_stock_movement_warehouse
  BEFORE INSERT ON stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION validate_stock_movement_warehouse();