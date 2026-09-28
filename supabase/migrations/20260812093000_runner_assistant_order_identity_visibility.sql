-- Runner Assistants may already read an authorized order while the related
-- user_directory rows remain hidden by the directory RLS policy. Keep this
-- resolver boolean-only and scoped to identities attached to permitted orders.
CREATE OR REPLACE FUNCTION public.can_runner_assistant_read_order_identity(
  p_identity_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.get_user_role(auth.uid()) = 'runner_assistant'::public.app_role
    AND p_identity_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.runner_id = ANY (
        COALESCE(
          public.get_runner_assistant_runner_ids(
            auth.uid(),
            ARRAY[
              'deliver',
              'confirm_receipt',
              'driver_inbox',
              'driver_stock',
              'cash_settlement',
              'driver_operations',
              'stock_audit',
              'inbound_stock',
              'driver_workload'
            ]::text[]
          ),
          ARRAY[]::uuid[]
        )
      )
      AND (o.runner_id = p_identity_id OR o.driver_id = p_identity_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_runner_assistant_read_order_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_runner_assistant_read_order_identity(uuid) TO authenticated;

DROP POLICY IF EXISTS "Runner assistants can read permitted order identities"
  ON public.user_directory;

CREATE POLICY "Runner assistants can read permitted order identities"
  ON public.user_directory
  FOR SELECT
  TO authenticated
  USING (
    public.can_runner_assistant_read_order_identity(user_directory.id)
  );

COMMENT ON FUNCTION public.can_runner_assistant_read_order_identity(uuid) IS
  'Returns true only for runner/driver identities attached to orders in the authenticated Assistant''s active permitted runner scope.';

NOTIFY pgrst, 'reload schema';
