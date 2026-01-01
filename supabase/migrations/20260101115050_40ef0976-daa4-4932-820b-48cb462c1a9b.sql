-- Fix 1: Restrict stock_movements visibility to warehouse owners and admins/managers
DROP POLICY IF EXISTS "Stock movements viewable by all authenticated" ON public.stock_movements;

CREATE POLICY "Users can view own warehouse movements" 
  ON public.stock_movements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM warehouses w
      WHERE w.id = stock_movements.warehouse_id
      AND (
        w.owner_user_id = auth.uid() OR 
        public.get_user_role(auth.uid()) IN ('admin', 'manager')
      )
    )
  );

-- Fix 2: Restrict storage bucket policies to related parties only

-- claim-proofs bucket: restrict to claim creator, order salesperson, runner, or admin
DROP POLICY IF EXISTS "Authenticated users can view claim proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can view related claim proofs" ON storage.objects;

CREATE POLICY "Users can view related claim proofs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'claim-proofs' AND
    (
      public.get_user_role(auth.uid()) = 'admin' OR
      EXISTS (
        SELECT 1 FROM claims c
        JOIN orders o ON c.order_id = o.id
        WHERE c.proof_url LIKE '%' || storage.objects.name || '%'
        AND (
          auth.uid() = c.created_by OR
          auth.uid() = o.salesperson_id OR
          auth.uid() = o.runner_id
        )
      )
    )
  );

-- delivery-photos bucket: restrict to order salesperson, runner, or admin/manager
DROP POLICY IF EXISTS "Authenticated users can view delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view related delivery photos" ON storage.objects;

CREATE POLICY "Users can view related delivery photos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'delivery-photos' AND
    (
      public.get_user_role(auth.uid()) IN ('admin', 'manager') OR
      EXISTS (
        SELECT 1 FROM attachments a
        JOIN orders o ON a.order_id = o.id
        WHERE a.url LIKE '%' || storage.objects.name || '%'
        AND (
          auth.uid() = o.salesperson_id OR
          auth.uid() = o.runner_id
        )
      )
    )
  );

-- inbound-photos bucket: restrict to shipment runner, salesperson, or admin/manager
DROP POLICY IF EXISTS "Authenticated users can view inbound photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view related inbound photos" ON storage.objects;

CREATE POLICY "Users can view related inbound photos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'inbound-photos' AND
    (
      public.get_user_role(auth.uid()) IN ('admin', 'manager') OR
      EXISTS (
        SELECT 1 FROM inbound_items ii
        JOIN inbound_shipments s ON ii.inbound_id = s.id
        WHERE ii.photo_url LIKE '%' || storage.objects.name || '%'
        AND (
          auth.uid() = s.salesperson_id OR
          auth.uid() = s.runner_id
        )
      )
    )
  );

-- attachments bucket: restrict to uploader, related order parties, or admin/manager
DROP POLICY IF EXISTS "Authenticated users can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view related attachments" ON storage.objects;

CREATE POLICY "Users can view related attachments" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments' AND
    (
      public.get_user_role(auth.uid()) IN ('admin', 'manager') OR
      EXISTS (
        SELECT 1 FROM attachments a
        LEFT JOIN orders o ON a.order_id = o.id
        LEFT JOIN claims c ON a.claim_id = c.id
        LEFT JOIN inbound_items ii ON a.inbound_item_id = ii.id
        LEFT JOIN inbound_shipments s ON ii.inbound_id = s.id
        WHERE a.url LIKE '%' || storage.objects.name || '%'
        AND (
          auth.uid() = a.uploaded_by OR
          auth.uid() = o.salesperson_id OR
          auth.uid() = o.runner_id OR
          auth.uid() = c.created_by OR
          auth.uid() = s.salesperson_id OR
          auth.uid() = s.runner_id
        )
      )
    )
  );

-- Also fix upload policies to be properly scoped
DROP POLICY IF EXISTS "Authenticated users can upload claim proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload claim proofs" ON storage.objects;

CREATE POLICY "Users can upload claim proofs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'claim-proofs' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Authenticated users can upload delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload delivery photos" ON storage.objects;

CREATE POLICY "Users can upload delivery photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'delivery-photos' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Authenticated users can upload inbound photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload inbound photos" ON storage.objects;

CREATE POLICY "Users can upload inbound photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'inbound-photos' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;

CREATE POLICY "Users can upload attachments" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'attachments' AND auth.uid() IS NOT NULL
  );