-- Part 2.1: Add order_owner_id column to orders table
-- The order owner for SKU validation purposes
-- For salesperson: always themselves
-- For manager: can be themselves OR a bound salesperson

ALTER TABLE orders 
ADD COLUMN order_owner_id uuid REFERENCES profiles(id);

-- Backfill existing orders: set order_owner_id = salesperson_id
UPDATE orders SET order_owner_id = salesperson_id WHERE order_owner_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE orders ALTER COLUMN order_owner_id SET NOT NULL;

-- Add index for performance
CREATE INDEX idx_orders_order_owner ON orders(order_owner_id);

-- Part 2.4: Trigger to validate order_items use products owned by order_owner_id
CREATE OR REPLACE FUNCTION validate_order_item_product_ownership()
RETURNS TRIGGER AS $$
DECLARE
  v_order_owner_id uuid;
  v_product_owner_id uuid;
  v_order_owner_name text;
  v_product_owner_name text;
BEGIN
  -- Skip validation if product_id is null (legacy order items without product link)
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get order owner
  SELECT o.order_owner_id, p.display_name 
  INTO v_order_owner_id, v_order_owner_name
  FROM orders o
  LEFT JOIN profiles p ON p.id = o.order_owner_id
  WHERE o.id = NEW.order_id;
  
  -- Get product owner
  SELECT pr.owner_user_id, p.display_name 
  INTO v_product_owner_id, v_product_owner_name
  FROM products pr
  LEFT JOIN profiles p ON p.id = pr.owner_user_id
  WHERE pr.id = NEW.product_id;
  
  -- Validate ownership match
  IF v_order_owner_id IS NOT NULL 
     AND v_product_owner_id IS NOT NULL 
     AND v_order_owner_id != v_product_owner_id THEN
    RAISE EXCEPTION 
      'Product owner mismatch: Cannot use products owned by %. Order owner is %. Please use products belonging to the order owner.',
      COALESCE(v_product_owner_name, 'Unknown'),
      COALESCE(v_order_owner_name, 'Unknown');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS check_order_item_product_ownership ON order_items;
CREATE TRIGGER check_order_item_product_ownership
  BEFORE INSERT OR UPDATE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION validate_order_item_product_ownership();