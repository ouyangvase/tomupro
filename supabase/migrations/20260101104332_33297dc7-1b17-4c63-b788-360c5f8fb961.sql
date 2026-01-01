-- Add indexes on products for faster dropdown search
CREATE INDEX IF NOT EXISTS idx_products_sku_name ON public.products(sku_name);
CREATE INDEX IF NOT EXISTS idx_products_sku_code ON public.products(sku_code);

-- Add updated_at column if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'updated_at') THEN
    ALTER TABLE public.products ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create trigger for auto-updating updated_at on products
CREATE OR REPLACE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Drop existing policies to recreate with proper permissions
DROP POLICY IF EXISTS "Products viewable by all authenticated" ON public.products;
DROP POLICY IF EXISTS "Salesperson and admin can create products" ON public.products;
DROP POLICY IF EXISTS "Product creators and admins can update" ON public.products;

-- RLS: Everyone authenticated can SELECT active products
CREATE POLICY "Products viewable by all authenticated"
  ON public.products
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS: Only Salesperson and Admin can INSERT products
CREATE POLICY "Salesperson and admin can create products"
  ON public.products
  FOR INSERT
  WITH CHECK (get_user_role(auth.uid()) IN ('salesperson', 'admin'));

-- RLS: Salesperson can update own, Admin can update all
CREATE POLICY "Product creators and admins can update"
  ON public.products
  FOR UPDATE
  USING (
    (auth.uid() = created_by AND get_user_role(auth.uid()) = 'salesperson')
    OR get_user_role(auth.uid()) = 'admin'
  );

-- RLS: Only Admin can DELETE products
CREATE POLICY "Only admin can delete products"
  ON public.products
  FOR DELETE
  USING (get_user_role(auth.uid()) = 'admin');