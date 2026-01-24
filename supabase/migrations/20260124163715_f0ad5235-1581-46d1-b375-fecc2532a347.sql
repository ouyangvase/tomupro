-- Phase 2: Fix stale warehouse references in orders
-- Update all orders with inactive fulfillment_warehouse_id to point to the correct active warehouse

UPDATE orders o
SET fulfillment_warehouse_id = (
  SELECT w.id 
  FROM warehouses w
  JOIN profiles p ON p.id = o.salesperson_id
  WHERE w.owner_user_id = o.salesperson_id
    AND w.warehouse_type = (CASE 
      WHEN p.role = 'manager' THEN 'MANAGER'
      ELSE 'SALESPERSON'
    END)::warehouse_type
    AND w.is_active = true
  LIMIT 1
)
FROM warehouses w_old
WHERE o.fulfillment_warehouse_id = w_old.id
  AND w_old.is_active = false;

-- Phase 3: Enhance the trigger with better error messages
CREATE OR REPLACE FUNCTION validate_stock_movement_warehouse()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_name TEXT;
BEGIN
  -- Check if warehouse is active
  IF NOT EXISTS (
    SELECT 1 FROM warehouses 
    WHERE id = NEW.warehouse_id AND is_active = true
  ) THEN
    -- Get owner name for helpful error
    SELECT p.display_name INTO v_owner_name
    FROM warehouses w
    JOIN profiles p ON p.id = w.owner_user_id
    WHERE w.id = NEW.warehouse_id;
    
    RAISE EXCEPTION 'Cannot create stock movement for inactive warehouse. Owner: %. Please use the active warehouse.', COALESCE(v_owner_name, 'Unknown');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;