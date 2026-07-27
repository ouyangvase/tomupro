-- Return the complete cash collection ledger in one authorized query.
-- This avoids fragile nested PostgREST joins for Runner Assistants.

CREATE OR REPLACE FUNCTION public.get_cash_settlement_details(p_runner_id uuid)
RETURNS TABLE (
  id uuid,
  runner_id uuid,
  driver_id uuid,
  order_id uuid,
  order_code text,
  customer_name text,
  cash_amount numeric,
  delivered_at timestamptz,
  status text,
  settlement_batch_id uuid,
  created_at timestamptz,
  settled_at timestamptz,
  driver_name text,
  order_qty bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_actor_id <> p_runner_id
    AND NOT public.has_runner_assistant_permission(v_actor_id, p_runner_id, 'cash_settlement')
  THEN
    RAISE EXCEPTION 'Cash Settlement access required';
  END IF;

  RETURN QUERY
  SELECT
    liability.id,
    liability.runner_id,
    liability.driver_id,
    liability.order_id,
    liability.order_code,
    liability.customer_name,
    liability.cash_amount,
    liability.delivered_at,
    liability.status,
    liability.settlement_batch_id,
    liability.created_at,
    liability.settled_at,
    driver.display_name AS driver_name,
    COALESCE(items.order_qty, 0)::bigint AS order_qty
  FROM public.cash_liabilities liability
  LEFT JOIN public.profiles driver ON driver.id = liability.driver_id
  LEFT JOIN LATERAL (
    SELECT sum(order_item.qty)::bigint AS order_qty
    FROM public.order_items order_item
    WHERE order_item.order_id = liability.order_id
  ) items ON true
  WHERE liability.runner_id = p_runner_id
    AND liability.status IN ('OPEN', 'PENDING_HANDOVER')
  ORDER BY liability.delivered_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cash_settlement_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cash_settlement_details(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
