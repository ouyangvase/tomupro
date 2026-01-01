-- Create a trigger to validate that order items only use products owned by the order's salesperson
-- This enforces that salespersons can only use their own products

CREATE OR REPLACE FUNCTION public.validate_order_item_product_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_salesperson_id uuid;
  product_owner_id uuid;
  current_user_role app_role;
BEGIN
  -- Get current user role
  current_user_role := get_user_role(auth.uid());
  
  -- Admin bypasses this check
  IF current_user_role = 'admin' THEN
    RETURN NEW;
  END IF;
  
  -- If no product_id, allow (custom item)
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get the salesperson_id from the order
  SELECT salesperson_id INTO order_salesperson_id
  FROM public.orders
  WHERE id = NEW.order_id;
  
  -- Get the owner of the product
  SELECT owner_user_id INTO product_owner_id
  FROM public.products
  WHERE id = NEW.product_id;
  
  -- Check ownership matches
  IF order_salesperson_id IS NOT NULL AND product_owner_id IS NOT NULL 
     AND order_salesperson_id != product_owner_id THEN
    RAISE EXCEPTION 'Cannot use product not owned by order salesperson. Product owner: %, Order salesperson: %', 
      product_owner_id, order_salesperson_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'validate_order_item_product_ownership_trigger'
  ) THEN
    CREATE TRIGGER validate_order_item_product_ownership_trigger
    BEFORE INSERT OR UPDATE ON public.order_items
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_order_item_product_ownership();
  END IF;
END;
$$;