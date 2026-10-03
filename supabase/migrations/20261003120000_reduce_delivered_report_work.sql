-- Keep delivered-order results unchanged while avoiding item aggregation for rows
-- that are discarded by sorting, pagination, or access filters.
CREATE OR REPLACE FUNCTION public.get_delivered_orders_fast(
  p_runner_id uuid DEFAULT NULL::uuid,
  p_salesperson_id uuid DEFAULT NULL::uuid,
  p_salesperson_ids uuid[] DEFAULT NULL::uuid[],
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, order_code text, order_date date, customer_name text, phone text, area text, address text,
  total_amount numeric, total_qty integer, payment_method text, payment_plan text,
  payment_history_unverified boolean, cod_amount numeric, transfer_paid_amount numeric, cod_due_amount numeric,
  receipt_url text, receipt_status text, driver_payment_method text, driver_cash_amount numeric,
  driver_transfer_amount numeric, status text, runner_status text, reconciliation_status text,
  delivered_at timestamp with time zone, salesperson_id uuid, salesperson_name text, runner_id uuid, runner_name text,
  driver_id uuid, driver_name text, items_summary text, items_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.current_operational_state = 'DELIVERED'
      AND o.order_type <> 'MIRI_INBOUND_PICKUP'
      AND o.status <> 'CANCELLED'
      AND auth.uid() IS NOT NULL
      AND (
        public.get_user_role(auth.uid())::text IN ('admin', 'finance_viewer')
        OR o.salesperson_id = auth.uid() OR o.runner_id = auth.uid() OR o.driver_id = auth.uid()
        OR public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'deliver')
        OR (public.get_user_role(auth.uid())::text = 'manager' AND o.salesperson_id = ANY(public.get_visible_owner_ids()))
        OR EXISTS (
          SELECT 1 FROM public.user_data_shares s
          WHERE s.viewer_user_id = auth.uid() AND s.subject_user_id = o.salesperson_id
            AND s.active AND s.scope_orders
        )
      )
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
      AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
    ORDER BY o.delivered_at DESC NULLS LAST, o.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    o.id, o.order_code, o.order_date, o.customer_name, o.phone, o.area, o.address,
    private.order_sales_amount(o.id), o.total_qty, o.payment_method::text, o.payment_plan,
    o.payment_history_unverified, o.cod_amount, private.order_transfer_paid_amount(o.id),
    private.order_cod_due_amount(o.id), o.receipt_url, o.receipt_status, o.driver_payment_method,
    o.driver_cash_amount, o.driver_transfer_amount, o.status::text, o.runner_status::text,
    o.reconciliation_status::text, o.delivered_at, o.salesperson_id, sp.display_name,
    o.runner_id, rn.display_name, o.driver_id, dr.display_name,
    item_data.items_summary, item_data.items_json
  FROM filtered_orders o
  LEFT JOIN public.profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN public.profiles rn ON rn.id = o.runner_id
  LEFT JOIN public.profiles dr ON dr.id = o.driver_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(string_agg(COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::text, ', '), 'No items') AS items_summary,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', oi.id, 'product_id', oi.product_id, 'sku_code', p.sku_code,
        'sku_name', p.sku_name, 'sku_label', oi.sku_label, 'qty', oi.qty,
        'price', oi.price, 'line_total', oi.line_total
      )), '[]'::jsonb) AS items_json
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = o.id
  ) item_data ON true
  ORDER BY o.delivered_at DESC NULLS LAST, o.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_delivered_orders_fast_report(
  p_runner_id uuid DEFAULT NULL::uuid,
  p_salesperson_id uuid DEFAULT NULL::uuid,
  p_salesperson_ids uuid[] DEFAULT NULL::uuid[],
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, order_code text, order_date date, customer_name text, phone text, area text, address text,
  total_amount numeric, total_qty integer, payment_method text, runner_status text, reconciliation_status text,
  delivered_at timestamp with time zone, driver_delivered_at timestamp with time zone,
  driver_payment_method text, driver_cash_amount numeric, driver_transfer_amount numeric,
  salesperson_id uuid, salesperson_name text, runner_id uuid, runner_name text, driver_id uuid, driver_name text,
  items_summary text, items_json jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  WITH filtered_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.current_operational_state = 'DELIVERED'
      AND o.order_type <> 'MIRI_INBOUND_PICKUP'
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
      AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
    ORDER BY COALESCE(o.driver_delivered_at, o.delivered_at) DESC NULLS LAST, o.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    o.id, o.order_code, o.order_date, o.customer_name, o.phone, o.area, o.address,
    private.order_sales_amount(o.id), o.total_qty, o.payment_method::text,
    o.runner_status::text, o.reconciliation_status::text, o.delivered_at,
    o.driver_delivered_at, o.driver_payment_method::text, o.driver_cash_amount,
    o.driver_transfer_amount, o.salesperson_id, sp.display_name, o.runner_id,
    rn.display_name, o.driver_id, dr.display_name,
    item_data.items_summary, item_data.items_json
  FROM filtered_orders o
  LEFT JOIN public.profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN public.profiles rn ON rn.id = o.runner_id
  LEFT JOIN public.profiles dr ON dr.id = o.driver_id
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(string_agg(COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::text, ', '), 'No items') AS items_summary,
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', oi.id, 'product_id', oi.product_id, 'sku_code', p.sku_code,
        'sku_name', p.sku_name, 'sku_label', oi.sku_label, 'qty', oi.qty,
        'price', oi.price, 'line_total', oi.line_total
      )), '[]'::jsonb) AS items_json
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = o.id
  ) item_data ON true
  ORDER BY COALESCE(o.driver_delivered_at, o.delivered_at) DESC NULLS LAST, o.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast(uuid, uuid, uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer) TO authenticated;
