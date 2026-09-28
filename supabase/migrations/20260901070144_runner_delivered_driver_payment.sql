-- Expose the payment split recorded by the Driver on Runner Delivered views.
-- This intentionally does not fall back to orders.payment_method: legacy rows
-- without a Driver record must remain visibly unrecorded.

DROP FUNCTION IF EXISTS public.get_runner_assistant_delivered_orders_report(uuid, uuid, uuid[], integer, integer);
DROP FUNCTION IF EXISTS public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer);

CREATE FUNCTION public.get_delivered_orders_fast_report(
  p_runner_id uuid DEFAULT NULL,
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
  driver_delivered_at timestamptz,
  driver_payment_method text,
  driver_cash_amount numeric,
  driver_transfer_amount numeric,
  salesperson_id uuid,
  salesperson_name text,
  runner_id uuid,
  runner_name text,
  driver_id uuid,
  driver_name text,
  items_summary text,
  items_json jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    o.id,
    o.order_code,
    o.order_date,
    o.customer_name,
    o.phone,
    o.area,
    o.address,
    o.total_amount,
    o.total_qty,
    o.payment_method::text,
    o.runner_status::text,
    o.reconciliation_status::text,
    o.delivered_at,
    o.driver_delivered_at,
    o.driver_payment_method::text,
    o.driver_cash_amount,
    o.driver_transfer_amount,
    o.salesperson_id,
    sp.display_name,
    o.runner_id,
    rn.display_name,
    o.driver_id,
    dr.display_name,
    COALESCE((
      SELECT string_agg(
        COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::text,
        ', '
      )
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), 'No items'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'product_id', oi.product_id,
        'sku_code', p.sku_code,
        'sku_name', p.sku_name,
        'sku_label', oi.sku_label,
        'qty', oi.qty,
        'price', oi.price,
        'line_total', oi.line_total
      ))
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  FROM orders o
  LEFT JOIN profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN profiles rn ON rn.id = o.runner_id
  LEFT JOIN profiles dr ON dr.id = o.driver_id
  WHERE o.current_operational_state = 'DELIVERED'
    AND o.order_type <> 'MIRI_INBOUND_PICKUP'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
  ORDER BY COALESCE(o.driver_delivered_at, o.delivered_at) DESC NULLS LAST, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

REVOKE ALL ON FUNCTION public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer) TO authenticated;

CREATE FUNCTION public.get_runner_assistant_delivered_orders_report(
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
  driver_delivered_at timestamptz,
  driver_payment_method text,
  driver_cash_amount numeric,
  driver_transfer_amount numeric,
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
SET search_path = public, pg_temp
AS $function$
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
  FROM public.get_delivered_orders_fast_report(
    p_runner_id,
    p_salesperson_id,
    p_salesperson_ids,
    p_limit,
    p_offset
  ) AS delivered
  JOIN public.orders o ON o.id = delivered.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_runner_assistant_delivered_orders_report(uuid, uuid, uuid[], integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_runner_assistant_delivered_orders_report(uuid, uuid, uuid[], integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
