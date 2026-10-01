-- Delivered reporting must keep showing the full sale amount for transfer orders.
-- Some legacy transfer orders were later rewritten with total_amount = 0 during
-- an operational status edit. Their audit snapshot still contains the original
-- sale total, so use that snapshot for reporting without changing settlement
-- or payment records.

CREATE OR REPLACE FUNCTION private.order_sales_amount(p_order_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
  WITH order_row AS (
    SELECT id, order_code, payment_method::text AS payment_method, total_amount
    FROM public.orders
    WHERE id = p_order_id
  ), audit_values AS (
    SELECT created_at, after_json ->> 'total_amount' AS amount_text
    FROM public.operations_audit_trail
    WHERE order_id = p_order_id
      AND (after_json ->> 'id' = p_order_id::text OR after_json ->> 'order_code' = (SELECT order_code FROM order_row))
    UNION ALL
    SELECT created_at, before_json ->> 'total_amount' AS amount_text
    FROM public.operations_audit_trail
    WHERE order_id = p_order_id
      AND (before_json ->> 'id' = p_order_id::text OR before_json ->> 'order_code' = (SELECT order_code FROM order_row))
  ), valid_audit_values AS (
    SELECT created_at,
      CASE
        WHEN amount_text ~ '^[0-9]+([.][0-9]+)?$' THEN amount_text::numeric
        ELSE NULL
      END AS amount
    FROM audit_values
  )
  SELECT COALESCE(
    NULLIF(o.total_amount, 0),
    CASE WHEN o.payment_method = 'TRANSFER' THEN (
      SELECT v.amount
      FROM valid_audit_values v
      WHERE v.amount > 0
      ORDER BY v.created_at DESC
      LIMIT 1
    ) END,
    o.total_amount,
    0
  )::numeric
  FROM order_row o;
$function$;

REVOKE ALL ON FUNCTION private.order_sales_amount(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_delivered_orders_fast(
  p_runner_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, order_code text, order_date date, customer_name text, phone text,
  area text, address text, total_amount numeric, total_qty integer,
  payment_method text, payment_plan text, payment_history_unverified boolean,
  cod_amount numeric, transfer_paid_amount numeric, cod_due_amount numeric,
  receipt_url text, receipt_status text, driver_payment_method text,
  driver_cash_amount numeric, driver_transfer_amount numeric, status text,
  runner_status text, reconciliation_status text, delivered_at timestamptz,
  salesperson_id uuid, salesperson_name text, runner_id uuid, runner_name text,
  driver_id uuid, driver_name text, items_summary text, items_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    o.id, o.order_code, o.order_date, o.customer_name, o.phone, o.area, o.address,
    private.order_sales_amount(o.id), o.total_qty, o.payment_method::text,
    o.payment_plan, o.payment_history_unverified,
    o.cod_amount, private.order_transfer_paid_amount(o.id), private.order_cod_due_amount(o.id),
    o.receipt_url, o.receipt_status, o.driver_payment_method,
    o.driver_cash_amount, o.driver_transfer_amount, o.status::text,
    o.runner_status::text, o.reconciliation_status::text, o.delivered_at,
    o.salesperson_id, sp.display_name, o.runner_id, rn.display_name,
    o.driver_id, dr.display_name,
    COALESCE((
      SELECT string_agg(COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::text, ', ')
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), 'No items'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id, 'product_id', oi.product_id, 'sku_code', p.sku_code,
        'sku_name', p.sku_name, 'sku_label', oi.sku_label, 'qty', oi.qty,
        'price', oi.price, 'line_total', oi.line_total
      ))
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  FROM public.orders o
  LEFT JOIN public.profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN public.profiles rn ON rn.id = o.runner_id
  LEFT JOIN public.profiles dr ON dr.id = o.driver_id
  WHERE COALESCE(to_jsonb(o)->>'current_operational_state', o.runner_status::text) = 'DELIVERED'
    AND COALESCE(to_jsonb(o)->>'order_type', 'STANDARD') <> 'MIRI_INBOUND_PICKUP'
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
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_delivered_orders_fast_report(
  p_runner_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, order_code text, order_date date, customer_name text, phone text,
  area text, address text, total_amount numeric, total_qty integer,
  payment_method text, runner_status text, reconciliation_status text,
  delivered_at timestamptz, driver_delivered_at timestamptz,
  driver_payment_method text, driver_cash_amount numeric,
  driver_transfer_amount numeric, salesperson_id uuid, salesperson_name text,
  runner_id uuid, runner_name text, driver_id uuid, driver_name text,
  items_summary text, items_json jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
  SELECT
    o.id, o.order_code, o.order_date, o.customer_name, o.phone, o.area, o.address,
    private.order_sales_amount(o.id), o.total_qty, o.payment_method::text,
    o.runner_status::text, o.reconciliation_status::text, o.delivered_at,
    o.driver_delivered_at, o.driver_payment_method::text, o.driver_cash_amount,
    o.driver_transfer_amount, o.salesperson_id, sp.display_name, o.runner_id,
    rn.display_name, o.driver_id, dr.display_name,
    COALESCE((
      SELECT string_agg(COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::text, ', ')
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), 'No items'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', oi.id, 'product_id', oi.product_id, 'sku_code', p.sku_code,
        'sku_name', p.sku_name, 'sku_label', oi.sku_label, 'qty', oi.qty,
        'price', oi.price, 'line_total', oi.line_total
      ))
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  FROM public.orders o
  LEFT JOIN public.profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN public.profiles rn ON rn.id = o.runner_id
  LEFT JOIN public.profiles dr ON dr.id = o.driver_id
  WHERE o.current_operational_state = 'DELIVERED'
    AND o.order_type <> 'MIRI_INBOUND_PICKUP'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
  ORDER BY COALESCE(o.driver_delivered_at, o.delivered_at) DESC NULLS LAST, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.get_delivered_summary(
  p_runner_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(total_delivered bigint, pending_claim bigint, total_amount numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
  SELECT count(*)::bigint,
    count(*) FILTER (WHERE o.reconciliation_status = 'NOT_CLAIMED')::bigint,
    coalesce(sum(private.order_sales_amount(o.id)), 0)::numeric
  FROM public.orders o
  WHERE o.current_operational_state = 'DELIVERED'
    AND o.order_type <> 'MIRI_INBOUND_PICKUP'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids));
$function$;

CREATE OR REPLACE FUNCTION public.get_delivered_summary_filtered(
  p_runner_id uuid DEFAULT NULL,
  p_salesperson_id uuid DEFAULT NULL,
  p_salesperson_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_area text DEFAULT NULL,
  p_claim_status text DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_sku_code text DEFAULT NULL
)
RETURNS TABLE(total_delivered bigint, pending_claim bigint, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered_orders AS (
    SELECT o.id, private.order_sales_amount(o.id) AS order_total, o.reconciliation_status
    FROM public.orders o
    WHERE o.runner_status = 'DELIVERED'
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
      AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
      AND (p_search IS NULL OR p_search = '' OR o.order_code ILIKE '%' || p_search || '%' OR o.customer_name ILIKE '%' || p_search || '%' OR o.area ILIKE '%' || p_search || '%')
      AND (p_area IS NULL OR o.area = p_area)
      AND (p_claim_status IS NULL OR p_claim_status = 'all'
        OR (p_claim_status = 'NOT_CLAIMED' AND o.reconciliation_status = 'NOT_CLAIMED')
        OR (p_claim_status = 'CLAIM_SUBMITTED' AND o.reconciliation_status IN ('ADMIN_ACK_PENDING', 'SP_ACK_PENDING'))
        OR (p_claim_status = 'APPROVED' AND o.reconciliation_status IN ('CLAIMED', 'SETTLED'))
        OR (p_claim_status = 'REJECTED' AND o.reconciliation_status = 'DISPUTE'))
      AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
      AND (p_sku_code IS NULL OR EXISTS (
        SELECT 1 FROM public.order_items oi
        LEFT JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = o.id
          AND (UPPER(TRIM(COALESCE(p.sku_code, ''))) = UPPER(TRIM(p_sku_code))
            OR UPPER(TRIM(SPLIT_PART(COALESCE(oi.sku_label, ''), '/', 1))) = UPPER(TRIM(p_sku_code)))
      ))
  )
  SELECT COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE reconciliation_status = 'NOT_CLAIMED')::bigint,
    COALESCE(SUM(order_total), 0)::numeric
  FROM filtered_orders;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast(uuid, uuid, uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivered_summary(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivered_summary_filtered(uuid, uuid, uuid[], text, text, text, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
