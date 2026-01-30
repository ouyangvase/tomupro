-- Fix stock_balance_view to only show products matching warehouse owner
DROP VIEW IF EXISTS stock_balance_view;
CREATE VIEW stock_balance_view AS
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
  AND w.is_active = true
  AND pr.owner_user_id = w.owner_user_id
  AND (p.role = ANY (ARRAY['salesperson'::app_role, 'manager'::app_role, 'admin'::app_role]))
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING sum(sm.qty_change) <> 0;

-- Delete the 4 bad stock movements that reference wrong product owners
DELETE FROM stock_movements 
WHERE id IN (
  '1bb08998-c90e-4397-bb02-0b8057ecdf4d',
  'beb39a8d-1382-4a62-b787-713ffca05a90',
  '5312f123-c330-45de-808d-a0cbc2896ddd',
  'b18daa23-48a4-46ce-b2c1-78e54ebfc605'
);

-- Add trigger to prevent future product/warehouse owner mismatches
CREATE OR REPLACE FUNCTION validate_stock_movement_product_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_product_owner_id UUID;
  v_warehouse_owner_id UUID;
BEGIN
  -- Skip validation if product_id is null
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  SELECT owner_user_id INTO v_product_owner_id FROM products WHERE id = NEW.product_id;
  SELECT owner_user_id INTO v_warehouse_owner_id FROM warehouses WHERE id = NEW.warehouse_id;
  
  IF v_product_owner_id IS NOT NULL AND v_warehouse_owner_id IS NOT NULL AND v_product_owner_id != v_warehouse_owner_id THEN
    RAISE EXCEPTION 'Product owner (%) does not match warehouse owner (%)', 
      v_product_owner_id, v_warehouse_owner_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS check_stock_movement_product_owner ON stock_movements;
CREATE TRIGGER check_stock_movement_product_owner
  BEFORE INSERT ON stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION validate_stock_movement_product_owner();