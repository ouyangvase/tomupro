-- Fix security warnings: Set search_path on newly created function
CREATE OR REPLACE FUNCTION validate_stock_movement_warehouse()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM warehouses 
    WHERE id = NEW.warehouse_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot create stock movement for inactive warehouse %', NEW.warehouse_id;
  END IF;
  
  RETURN NEW;
END;
$$;