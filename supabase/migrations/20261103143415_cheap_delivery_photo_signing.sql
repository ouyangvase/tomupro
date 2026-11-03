BEGIN;

-- Replacing a storage.objects policy locks the table; fail instead of making
-- every storage request queue behind the lock.
SET LOCAL lock_timeout = '5s';

-- Signing a delivery photo runs the storage.objects SELECT policy once per
-- photo.  The old policy matched attachments with url LIKE '%' || name || '%',
-- a sequential scan of every attachment, and inlined the orders RLS into each
-- sign's plan: about 130 ms of database time per photo on 2026-11-03.
--
-- Delivery-photo rows store the object's public URL, so the object name is the
-- part after '/delivery-photos/':
--   https://<project>.supabase.co/storage/v1/object/public/delivery-photos/<uploader_id>/<ts>.webp
CREATE INDEX IF NOT EXISTS idx_attachments_order_id ON public.attachments (order_id);
CREATE INDEX IF NOT EXISTS idx_attachments_delivery_photo_name
  ON public.attachments ((split_part(url, '/delivery-photos/', 2)));

-- The order's salesperson and runner, and that runner's active assistants with
-- a delivery permission (driver_inbox, driver_operations, deliver,
-- confirm_receipt), may see the order's photos.  The orders RLS already lets
-- each of them read the order; SECURITY DEFINER keeps that RLS out of every
-- caller's plan and per-row cost.
CREATE OR REPLACE FUNCTION private.is_order_photo_party(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND (
        o.salesperson_id = auth.uid()
        OR o.runner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.runner_assistants ra
          WHERE ra.assistant_id = auth.uid()
            AND ra.runner_id = o.runner_id
            AND ra.is_active
            AND (ra.can_manage_driver_inbox OR ra.can_manage_driver_operations OR ra.can_deliver OR ra.can_confirm_receipt)
        )
      )
  );
$$;

-- Runs as the owner so the attachment lookup uses the name index instead of
-- the attachments RLS (which would check every row first).
CREATE OR REPLACE FUNCTION private.can_view_delivery_photo(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.attachments a
    WHERE split_part(a.url, '/delivery-photos/', 2) = p_name
      AND private.is_order_photo_party(a.order_id)
  );
$$;

DROP POLICY IF EXISTS "Users can view related delivery photos" ON storage.objects;

CREATE POLICY "Users can view related delivery photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-photos' AND
    (
      public.get_user_role(auth.uid()) IN ('admin', 'manager') OR
      private.can_view_delivery_photo(name)
    )
  );

-- Attachment rows were readable by every signed-in user, and any user could
-- insert a row whose url named someone else's photo, which the old LIKE policy
-- then let them sign.  Rows are now readable by their uploader, admins,
-- managers and the order's photo parties.  Drivers add photos only to their
-- assigned order and only from their own upload folder; admins keep the
-- stock-adjustment proof upload.
DROP POLICY IF EXISTS "Attachments viewable by authenticated" ON public.attachments;
DROP POLICY IF EXISTS "Users can upload attachments" ON public.attachments;
DROP POLICY IF EXISTS "Uploader and order photo parties can view attachments" ON public.attachments;
DROP POLICY IF EXISTS "Order drivers can upload delivery photos" ON public.attachments;

CREATE POLICY "Uploader and order photo parties can view attachments" ON public.attachments
  FOR SELECT TO authenticated
  USING (
    uploaded_by = (SELECT auth.uid()) OR
    (SELECT public.get_user_role((SELECT auth.uid()))) IN ('admin', 'manager') OR
    private.is_order_photo_party(order_id)
  );

CREATE POLICY "Order drivers can upload delivery photos" ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid()) AND
    (
      public.get_user_role(auth.uid()) = 'admin' OR
      (
        type = 'delivery_photo' AND
        url ~ ('^https://[^/]+/storage/v1/object/public/delivery-photos/' || auth.uid()::text || '/[^/]+$') AND
        EXISTS (
          SELECT 1
          FROM public.orders o
          WHERE o.id = attachments.order_id
            AND o.driver_id = auth.uid()
        )
      )
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
