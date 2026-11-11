-- Scope claim batch history to the orders visible to the authenticated user.
-- Admins and managers keep the existing full-history access, while runners
-- keep access to their own submitted batches.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.can_view_claim_batch_item(p_batch_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.get_user_role(auth.uid()) IN ('admin', 'manager') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.claim_batch_items cbi
      JOIN public.claim_batches cb ON cb.id = cbi.batch_id
      JOIN public.orders o ON o.id = cbi.order_id
      WHERE cbi.id = p_batch_item_id
        AND (
          cb.runner_id = auth.uid()
          OR o.salesperson_id = ANY(
            COALESCE(public.get_accessible_owner_ids('claims'), ARRAY[]::uuid[])
          )
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION private.can_view_claim_batch(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.get_user_role(auth.uid()) IN ('admin', 'manager') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.claim_batches cb
      WHERE cb.id = p_batch_id
        AND cb.runner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.claim_batch_items cbi
      WHERE cbi.batch_id = p_batch_id
        AND private.can_view_claim_batch_item(cbi.id)
    )
  END;
$$;

REVOKE ALL ON FUNCTION private.can_view_claim_batch_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_view_claim_batch(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_claim_batch_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_claim_batch(uuid) TO authenticated;

DROP POLICY IF EXISTS "All authenticated can view claim batches"
  ON public.claim_batches;
DROP POLICY IF EXISTS "Runners can view own claim batches"
  ON public.claim_batches;
CREATE POLICY "Claim batches visible to related users"
  ON public.claim_batches
  FOR SELECT
  TO authenticated
  USING (private.can_view_claim_batch(id));

DROP POLICY IF EXISTS "All authenticated can view claim batch items"
  ON public.claim_batch_items;
DROP POLICY IF EXISTS "View claim batch items for related parties"
  ON public.claim_batch_items;
CREATE POLICY "Claim batch items visible to related users"
  ON public.claim_batch_items
  FOR SELECT
  TO authenticated
  USING (private.can_view_claim_batch_item(id));

COMMENT ON FUNCTION private.can_view_claim_batch(uuid) IS
  'Scopes claim batch history to admins/managers, the submitting runner, or batches containing orders owned by the authenticated user scope.';

COMMENT ON FUNCTION private.can_view_claim_batch_item(uuid) IS
  'Scopes claim batch items to the submitting runner or the order owners visible to the authenticated user scope.';

NOTIFY pgrst, 'reload schema';
