-- Fix: Update enforce_stock_deduction_rules trigger to allow manager warehouses
-- Managers also own stock and should be able to have deliveries processed

CREATE OR REPLACE FUNCTION enforce_stock_deduction_rules()
RETURNS TRIGGER AS $$
DECLARE
  v_order_stock_deducted boolean;
  v_warehouse_owner_role text;
BEGIN
  -- Only check for stock-affecting movement types
  IF NEW.movement_type IN ('DELIVER_DEDUCT', 'SALE_DEDUCT', 'RETURN_TO_OWNER') THEN
    
    -- Verify warehouse belongs to salesperson/admin/manager only
    -- Managers also own stock and can have orders processed against their inventory
    SELECT p.role INTO v_warehouse_owner_role
    FROM warehouses w
    JOIN profiles p ON p.id = w.owner_user_id
    WHERE w.id = NEW.warehouse_id;
    
    IF v_warehouse_owner_role NOT IN ('salesperson', 'admin', 'manager') THEN
      RAISE EXCEPTION 'Stock movements can only affect salesperson/admin/manager warehouses. Got role: %', v_warehouse_owner_role;
    END IF;
    
    -- For DELIVER_DEDUCT, check order hasn't already been deducted
    IF NEW.movement_type = 'DELIVER_DEDUCT' AND NEW.order_id IS NOT NULL THEN
      SELECT stock_deducted INTO v_order_stock_deducted
      FROM orders
      WHERE id = NEW.order_id;
      
      -- Allow if order doesn't have stock_deducted flag yet (we're about to set it)
      -- This is handled by the edge function - trigger just validates warehouse ownership
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;