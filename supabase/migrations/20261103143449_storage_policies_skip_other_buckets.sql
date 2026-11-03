BEGIN;

-- Replacing a storage.objects policy locks the table; fail instead of making
-- every storage request queue behind the lock.
SET LOCAL lock_timeout = '5s';

-- Postgres plans every storage.objects SELECT policy on each storage request,
-- whatever its bucket.  These three policies join attachments, claims, orders
-- and inbound tables together with those tables' own RLS: on a copy of the
-- production schema they were about 16 of the 17 ms spent planning each
-- delivery-photo sign (71 ms of planning per sign in production).  Their
-- checks move unchanged into SECURITY INVOKER functions: they still run as the
-- caller, under the same RLS, but only for objects in their own bucket.

CREATE OR REPLACE FUNCTION private.can_view_attachment_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.attachments a
    LEFT JOIN public.orders o ON a.order_id = o.id
    LEFT JOIN public.claims c ON a.claim_id = c.id
    LEFT JOIN public.inbound_items ii ON a.inbound_item_id = ii.id
    LEFT JOIN public.inbound_shipments s ON ii.inbound_id = s.id
    WHERE a.url LIKE '%' || p_name || '%'
      AND (
        auth.uid() = a.uploaded_by OR
        auth.uid() = o.salesperson_id OR
        auth.uid() = o.runner_id OR
        auth.uid() = c.created_by OR
        auth.uid() = s.salesperson_id OR
        auth.uid() = s.runner_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_view_claim_proof_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.claims c
    JOIN public.orders o ON c.order_id = o.id
    WHERE c.proof_url LIKE '%' || p_name || '%'
      AND (
        auth.uid() = c.created_by OR
        auth.uid() = o.salesperson_id OR
        auth.uid() = o.runner_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_view_inbound_photo_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.inbound_items ii
    JOIN public.inbound_shipments s ON ii.inbound_id = s.id
    WHERE ii.photo_url LIKE '%' || p_name || '%'
      AND (
        auth.uid() = s.salesperson_id OR
        auth.uid() = s.runner_id
      )
  );
$$;

DROP POLICY IF EXISTS "Users can view related attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view related claim proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can view related inbound photos" ON storage.objects;

CREATE POLICY "Users can view related attachments" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'attachments' AND
    (
      public.get_user_role(auth.uid()) IN ('admin', 'manager') OR
      private.can_view_attachment_object(name)
    )
  );

CREATE POLICY "Users can view related claim proofs" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'claim-proofs' AND
    (
      public.get_user_role(auth.uid()) = 'admin' OR
      private.can_view_claim_proof_object(name)
    )
  );

CREATE POLICY "Users can view related inbound photos" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'inbound-photos' AND
    (
      public.get_user_role(auth.uid()) IN ('admin', 'manager') OR
      private.can_view_inbound_photo_object(name)
    )
  );

COMMIT;
