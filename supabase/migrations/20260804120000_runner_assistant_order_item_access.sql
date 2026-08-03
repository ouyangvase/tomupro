-- Keep order item visibility aligned with the existing shared runner workspace scope.
-- This is read-only and does not change order assignment or inventory accounting.
DROP POLICY IF EXISTS "Runner assistants can view assigned runner order items"
  ON public.order_items;

CREATE POLICY "Runner assistants can view assigned runner order items"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.runner_id = ANY (
          COALESCE(
            (
              SELECT public.get_runner_assistant_runner_ids(
                (SELECT auth.uid()),
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
              )
            ),
            ARRAY[]::uuid[]
          )
        )
    )
  );
