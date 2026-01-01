-- Update storage buckets to be private
UPDATE storage.buckets SET public = false WHERE id = 'proofs';
UPDATE storage.buckets SET public = false WHERE id = 'inbound-photos';
UPDATE storage.buckets SET public = false WHERE id = 'delivery-photos';

-- Rename proofs bucket to claim-proofs
UPDATE storage.buckets SET id = 'claim-proofs', name = 'claim-proofs' WHERE id = 'proofs';

-- Create attachments bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Update storage policies for private access
DROP POLICY IF EXISTS "Anyone can view proofs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view inbound photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload inbound photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload delivery photos" ON storage.objects;

-- Create new policies for claim-proofs bucket (authenticated access only)
CREATE POLICY "Authenticated users can upload claim proofs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'claim-proofs' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view claim proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'claim-proofs' AND auth.uid() IS NOT NULL);

-- Create policies for inbound-photos bucket
CREATE POLICY "Authenticated users can upload inbound photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'inbound-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view inbound photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'inbound-photos' AND auth.uid() IS NOT NULL);

-- Create policies for delivery-photos bucket
CREATE POLICY "Authenticated users can upload delivery photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'delivery-photos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view delivery photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'delivery-photos' AND auth.uid() IS NOT NULL);

-- Create policies for attachments bucket
CREATE POLICY "Authenticated users can upload attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

-- Create trigger to auto-set fulfillment_warehouse_id to salesperson's warehouse
CREATE OR REPLACE FUNCTION public.set_default_fulfillment_warehouse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.fulfillment_warehouse_id IS NULL AND NEW.salesperson_id IS NOT NULL THEN
    SELECT id INTO NEW.fulfillment_warehouse_id
    FROM public.warehouses
    WHERE owner_user_id = NEW.salesperson_id
    AND warehouse_type = 'SALESPERSON'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_order_fulfillment_warehouse
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_fulfillment_warehouse();

-- Add missing RLS policies for Runners to update order delivery fields
DROP POLICY IF EXISTS "Salesperson and runner can update their orders" ON public.orders;

CREATE POLICY "Users can update their orders based on role" ON public.orders
  FOR UPDATE USING (
    -- Salesperson can update their own orders
    (auth.uid() = salesperson_id) OR
    -- Runner can update orders assigned to them (limited fields handled in app)
    (auth.uid() = runner_id) OR
    -- Admin can update any order
    (public.get_user_role(auth.uid()) = 'admin')
  );

-- Ensure runner can create claims for their assigned orders
DROP POLICY IF EXISTS "Runners can create claims" ON public.claims;

CREATE POLICY "Runners and admins can create claims" ON public.claims
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND (
      public.get_user_role(auth.uid()) = 'admin' OR
      (public.get_user_role(auth.uid()) = 'runner' AND EXISTS (
        SELECT 1 FROM public.orders WHERE id = order_id AND runner_id = auth.uid()
      ))
    )
  );

-- Add policy for runners to create inbound items
DROP POLICY IF EXISTS "Inbound items follow shipment access" ON public.inbound_items;

CREATE POLICY "Inbound items access by related parties" ON public.inbound_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.inbound_shipments s 
      WHERE s.id = inbound_items.inbound_id 
      AND (
        auth.uid() = s.runner_id OR 
        auth.uid() = s.salesperson_id OR 
        public.get_user_role(auth.uid()) IN ('admin', 'manager')
      )
    )
  );

-- Ensure salesperson can update products they created
DROP POLICY IF EXISTS "Salesperson and admin can update products" ON public.products;

CREATE POLICY "Product creators and admins can update" ON public.products
  FOR UPDATE USING (
    (auth.uid() = created_by AND public.get_user_role(auth.uid()) = 'salesperson') OR
    public.get_user_role(auth.uid()) = 'admin'
  );