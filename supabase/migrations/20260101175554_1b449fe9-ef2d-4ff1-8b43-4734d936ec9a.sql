-- Add order_code to orders table (required, unique)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_code text;

-- Create unique index for order_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_code ON public.orders(order_code) WHERE order_code IS NOT NULL;

-- Update existing orders with auto-generated order_code where null
UPDATE public.orders 
SET order_code = 'ORD-' || SUBSTRING(id::text, 1, 8)
WHERE order_code IS NULL;

-- Make order_code NOT NULL after backfilling
ALTER TABLE public.orders ALTER COLUMN order_code SET NOT NULL;

-- Add owner_user_id to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.profiles(id);

-- Backfill existing products with created_by as owner
UPDATE public.products 
SET owner_user_id = created_by
WHERE owner_user_id IS NULL;

-- Make owner_user_id NOT NULL after backfilling
ALTER TABLE public.products ALTER COLUMN owner_user_id SET NOT NULL;

-- Drop existing RLS policies on products to recreate them
DROP POLICY IF EXISTS "Products viewable by all authenticated" ON public.products;
DROP POLICY IF EXISTS "Product creators and admins can update" ON public.products;
DROP POLICY IF EXISTS "Salesperson and admin can create products" ON public.products;
DROP POLICY IF EXISTS "Only admin can delete products" ON public.products;

-- Create new RLS policies for products based on ownership

-- Salesperson can only see their own products
CREATE POLICY "Salesperson can view own products"
ON public.products
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'salesperson' AND owner_user_id = auth.uid()
);

-- Manager can see products of salespersons in their manager group
CREATE POLICY "Manager can view group products"
ON public.products
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager' AND EXISTS (
    SELECT 1 FROM public.manager_groups mg
    JOIN public.group_members gm ON gm.group_id = mg.id
    WHERE mg.manager_user_id = auth.uid()
    AND gm.member_user_id = products.owner_user_id
  )
);

-- Admin can see all products
CREATE POLICY "Admin can view all products"
ON public.products
FOR SELECT
USING (get_user_role(auth.uid()) = 'admin');

-- Salesperson can create products (owned by themselves)
CREATE POLICY "Salesperson can create own products"
ON public.products
FOR INSERT
WITH CHECK (
  get_user_role(auth.uid()) = 'salesperson' AND owner_user_id = auth.uid()
);

-- Admin can create any product
CREATE POLICY "Admin can create any product"
ON public.products
FOR INSERT
WITH CHECK (get_user_role(auth.uid()) = 'admin');

-- Salesperson can only update their own products
CREATE POLICY "Salesperson can update own products"
ON public.products
FOR UPDATE
USING (
  get_user_role(auth.uid()) = 'salesperson' AND owner_user_id = auth.uid()
);

-- Admin can update any product
CREATE POLICY "Admin can update any product"
ON public.products
FOR UPDATE
USING (get_user_role(auth.uid()) = 'admin');

-- Only admin can delete products
CREATE POLICY "Admin can delete products"
ON public.products
FOR DELETE
USING (get_user_role(auth.uid()) = 'admin');

-- Create a function to validate order items use products owned by the order's salesperson
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

-- Create trigger to enforce product ownership on order items
DROP TRIGGER IF EXISTS validate_order_item_product_ownership_trigger ON public.order_items;
CREATE TRIGGER validate_order_item_product_ownership_trigger
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_order_item_product_ownership();