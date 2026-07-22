-- Urgent Supabase Advisor hardening.
-- Keep app-facing function bodies and views unchanged; only tighten grants/policies.

DO $$
DECLARE
  routine record;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        '_tmp_query',
        'exec_encoded_sql',
        'exec_sql',
        'get_rls_policies',
        'query_sql',
        'run_query'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', routine.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', routine.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', routine.signature);
  END LOOP;
END
$$;

-- Public buckets remain public for direct public URLs; remove API object listing.
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "branding_storage_read" ON storage.objects;
DROP POLICY IF EXISTS "public_read_receipts" ON storage.objects;

-- Cost/profit reference data should not be editable by every signed-in user.
DROP POLICY IF EXISTS "Authenticated users can manage sku_cost" ON public.sku_cost;

CREATE POLICY "Admins can manage sku_cost"
  ON public.sku_cost
  FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
