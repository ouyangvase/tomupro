-- Allow a Runner who is also an Assistant to use the combined workspace.
-- This only expands read scope to active linked Runner workspaces; write and
-- order lifecycle permissions remain enforced by their existing RPCs.

DROP POLICY IF EXISTS "Runner assistants can view bound runner orders"
  ON public.orders;

CREATE POLICY "Runner assistants can view bound runner orders"
  ON public.orders
  FOR SELECT
  USING (
    public.has_any_runner_assistant_permission(
      auth.uid(),
      runner_id,
      ARRAY[
        'deliver',
        'confirm_receipt',
        'driver_inbox',
        'driver_operations',
        'driver_workload',
        'driver_stock',
        'cash_settlement'
      ]::text[]
    )
  );

DROP POLICY IF EXISTS "Runner assistants can view bound runner order items"
  ON public.order_items;

CREATE POLICY "Runner assistants can view bound runner order items"
  ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_any_runner_assistant_permission(
          auth.uid(),
          o.runner_id,
          ARRAY[
            'deliver',
            'confirm_receipt',
            'driver_inbox',
            'driver_operations',
            'driver_workload',
            'driver_stock',
            'cash_settlement'
          ]::text[]
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_runner_assistant_delivered_orders(
  p_runner_id uuid,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  order_code text,
  order_date date,
  customer_name text,
  phone text,
  area text,
  address text,
  total_amount numeric,
  total_qty integer,
  payment_method text,
  runner_status text,
  reconciliation_status text,
  delivered_at timestamptz,
  salesperson_id uuid,
  salesperson_name text,
  runner_id uuid,
  runner_name text,
  driver_id uuid,
  driver_name text,
  items_summary text,
  items_json jsonb,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR p_runner_id IS NULL
     OR NOT (
       (
         auth.uid() = p_runner_id
         AND public.get_user_role(auth.uid())::text = 'runner'
       )
       OR public.has_runner_assistant_permission(auth.uid(), p_runner_id, 'deliver')
     )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT delivered.*, o.status::text
  FROM public.get_delivered_orders_fast(
    p_runner_id,
    p_salesperson_id,
    p_salesperson_ids,
    p_limit,
    p_offset
  ) AS delivered
  JOIN public.orders o ON o.id = delivered.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_runner_assistant_delivered_orders(
  uuid, uuid, uuid[], integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_runner_assistant_delivered_orders(
  uuid, uuid, uuid[], integer, integer
) TO authenticated;

NOTIFY pgrst, 'reload schema';
