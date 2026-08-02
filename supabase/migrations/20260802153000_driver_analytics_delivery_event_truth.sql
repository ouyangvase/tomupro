-- Driver Analytics is an event report, not an assignment report.
-- A row belongs to the Brunei date on which the Driver tapped Delivered.

CREATE OR REPLACE FUNCTION private.driver_analytics_event_date(
  p_driver_delivered_at timestamptz
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT (p_driver_delivered_at AT TIME ZONE 'Asia/Brunei')::date;
$$;

CREATE OR REPLACE FUNCTION private.driver_analytics_reported_payment_components(
  p_order_amount numeric,
  p_payment_method text,
  p_driver_payment_method text,
  p_driver_cash_amount numeric,
  p_driver_transfer_amount numeric
)
RETURNS TABLE (cash_amount numeric, transfer_amount numeric)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT
    GREATEST(0, CASE
      WHEN p_driver_cash_amount IS NOT NULL THEN p_driver_cash_amount
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH' THEN COALESCE(p_order_amount, 0)
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'TRANSFER' THEN 0
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH_TRANSFER'
        THEN COALESCE(p_order_amount, 0) - COALESCE(p_driver_transfer_amount, 0)
      WHEN upper(COALESCE(p_payment_method, '')) IN ('COD', 'CASH') THEN COALESCE(p_order_amount, 0)
      ELSE 0
    END)::numeric,
    GREATEST(0, CASE
      WHEN p_driver_transfer_amount IS NOT NULL THEN p_driver_transfer_amount
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'TRANSFER' THEN COALESCE(p_order_amount, 0)
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH' THEN 0
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH_TRANSFER'
        THEN COALESCE(p_order_amount, 0) - COALESCE(p_driver_cash_amount, 0)
      WHEN upper(COALESCE(p_payment_method, '')) IN ('TRANSFER', 'BANK_TRANSFER') THEN COALESCE(p_order_amount, 0)
      ELSE 0
    END)::numeric;
$$;

CREATE OR REPLACE FUNCTION private.get_driver_analytics_cohort(
  p_driver_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  order_id uuid,
  driver_id uuid,
  runner_id uuid,
  effective_assignment_date date,
  assignment_timestamp timestamptz,
  assignment_source text,
  assignment_batch_id uuid,
  reassigned boolean,
  order_amount numeric,
  payment_method text,
  driver_payment_method text,
  assignment_state text,
  accepted_delivery boolean,
  accepted_failed boolean,
  pending_acceptance boolean,
  cash_collected_amount numeric,
  transfer_amount numeric,
  cash_pending_amount numeric,
  cash_settlement_status text,
  driver_status text,
  runner_status text,
  runner_accept_status text,
  driver_submitted_at timestamptz,
  runner_accepted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH events AS (
    SELECT
      o.*,
      private.driver_analytics_event_date(o.driver_delivered_at) AS event_date,
      private.driver_analytics_is_accepted_delivery(
        o.driver_status::text,
        o.runner_accept_status::text,
        o.runner_status::text
      ) AS is_accepted_delivery,
      COALESCE(o.total_amount, 0)::numeric AS event_amount
    FROM public.orders o
    WHERE o.driver_id = p_driver_id
      AND o.driver_status::text = 'DRIVER_DELIVERED'
      AND o.driver_delivered_at IS NOT NULL
      AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND upper(COALESCE(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
  ), financials AS (
    SELECT
      events.*,
      payment.cash_amount AS reported_cash_amount,
      payment.transfer_amount AS reported_transfer_amount
    FROM events
    CROSS JOIN LATERAL private.driver_analytics_reported_payment_components(
      events.event_amount,
      events.payment_method::text,
      events.driver_payment_method,
      events.driver_cash_amount,
      events.driver_transfer_amount
    ) payment
    WHERE events.event_date IS NOT NULL
      AND (p_date_from IS NULL OR events.event_date >= p_date_from)
      AND (p_date_to IS NULL OR events.event_date <= p_date_to)
  ), liabilities AS (
    SELECT
      financials.*,
      COALESCE(liability.open_amount, 0)::numeric AS liability_open_amount,
      COALESCE(liability.has_pending_handover, false) AS liability_has_pending_handover,
      COALESCE(liability.has_settled, false) AS liability_has_settled,
      accepted_audit.created_at AS runner_accepted_audit_at
    FROM financials
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(item.cash_amount) FILTER (
          WHERE item.status IN ('OPEN', 'PENDING_HANDOVER')
        ), 0)::numeric AS open_amount,
        COALESCE(bool_or(item.status = 'PENDING_HANDOVER'), false) AS has_pending_handover,
        COALESCE(bool_or(item.status = 'SETTLED'), false) AS has_settled
      FROM public.cash_liabilities item
      WHERE item.order_id = financials.id
        AND item.driver_id = p_driver_id
    ) liability ON true
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = financials.id
        AND audit.action = 'DRIVER_DELIVERY_ACCEPTED'
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) accepted_audit ON true
  )
  SELECT
    liabilities.id,
    liabilities.driver_id,
    liabilities.runner_id,
    liabilities.event_date,
    liabilities.driver_delivered_at,
    'driver_delivered_at_brunei',
    liabilities.driver_assignment_batch_id,
    false,
    liabilities.event_amount,
    liabilities.payment_method::text,
    liabilities.driver_payment_method,
    CASE WHEN liabilities.is_accepted_delivery THEN 'DELIVERED' ELSE 'PENDING_ACCEPTANCE' END,
    liabilities.is_accepted_delivery,
    false,
    NOT liabilities.is_accepted_delivery,
    liabilities.reported_cash_amount,
    liabilities.reported_transfer_amount,
    CASE
      WHEN liabilities.reported_cash_amount <= 0 THEN 0::numeric
      WHEN NOT liabilities.is_accepted_delivery THEN liabilities.reported_cash_amount
      ELSE liabilities.liability_open_amount
    END,
    CASE
      WHEN liabilities.reported_cash_amount <= 0 THEN 'NOT_APPLICABLE'
      WHEN NOT liabilities.is_accepted_delivery THEN 'PENDING_ACCEPTANCE'
      WHEN liabilities.liability_open_amount > 0 AND liabilities.liability_has_pending_handover THEN 'PENDING_HANDOVER'
      WHEN liabilities.liability_open_amount > 0 THEN 'OPEN'
      WHEN liabilities.liability_has_settled THEN 'SETTLED'
      ELSE 'UNKNOWN'
    END,
    liabilities.driver_status::text,
    liabilities.runner_status::text,
    liabilities.runner_accept_status::text,
    liabilities.driver_delivered_at,
    liabilities.runner_accepted_audit_at
  FROM liabilities
  ORDER BY liabilities.driver_delivered_at, liabilities.id;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_analytics(
  p_driver_id uuid,
  p_range_from date,
  p_range_to date,
  p_calendar_from date,
  p_calendar_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role text := public.get_user_role(v_actor_id)::text;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL OR (v_actor_id <> p_driver_id AND v_role <> 'admin') THEN
    RAISE EXCEPTION 'Driver Analytics is only available to the Driver or an administrator';
  END IF;
  IF p_range_from IS NULL OR p_range_to IS NULL OR p_range_from > p_range_to THEN
    RAISE EXCEPTION 'Invalid analytics summary range';
  END IF;
  IF p_calendar_from IS NULL OR p_calendar_to IS NULL OR p_calendar_from > p_calendar_to THEN
    RAISE EXCEPTION 'Invalid analytics calendar range';
  END IF;

  WITH cohort AS MATERIALIZED (
    SELECT * FROM private.get_driver_analytics_cohort(
      p_driver_id,
      LEAST(p_range_from, p_calendar_from),
      GREATEST(p_range_to, p_calendar_to)
    )
  ), range_rows AS (
    SELECT * FROM cohort WHERE effective_assignment_date BETWEEN p_range_from AND p_range_to
  ), range_metrics AS (
    SELECT
      COUNT(*)::integer AS delivered_orders,
      COUNT(*) FILTER (WHERE accepted_delivery)::integer AS accepted_orders,
      COUNT(*) FILTER (WHERE pending_acceptance)::integer AS pending_acceptance,
      COALESCE(SUM(order_amount), 0)::numeric AS total_sales,
      COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS accepted_sales,
      COALESCE(SUM(order_amount) FILTER (WHERE pending_acceptance), 0)::numeric AS pending_acceptance_amount,
      COALESCE(SUM(cash_collected_amount), 0)::numeric AS cash_amount,
      COUNT(*) FILTER (WHERE cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(cash_pending_amount), 0)::numeric AS cash_on_hand,
      COUNT(*) FILTER (WHERE cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(transfer_amount), 0)::numeric AS transfer_amount,
      COUNT(*) FILTER (WHERE transfer_amount > 0)::integer AS transfer_order_count
    FROM range_rows
  ), daily AS (
    SELECT
      day::date AS date,
      COUNT(c.order_id)::integer AS delivered_orders,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery)::integer AS accepted_orders,
      COUNT(c.order_id) FILTER (WHERE c.pending_acceptance)::integer AS pending_acceptance,
      COALESCE(SUM(c.order_amount), 0)::numeric AS total_sales,
      COALESCE(SUM(c.order_amount) FILTER (WHERE c.pending_acceptance), 0)::numeric AS pending_acceptance_amount,
      COALESCE(SUM(c.cash_collected_amount), 0)::numeric AS cash_amount,
      COUNT(c.order_id) FILTER (WHERE c.cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(c.cash_pending_amount), 0)::numeric AS cash_on_hand,
      COUNT(c.order_id) FILTER (WHERE c.cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(c.transfer_amount), 0)::numeric AS transfer_amount,
      COUNT(c.order_id) FILTER (WHERE c.transfer_amount > 0)::integer AS transfer_order_count
    FROM generate_series(p_calendar_from, p_calendar_to, interval '1 day') day
    LEFT JOIN cohort c ON c.effective_assignment_date = day::date
    GROUP BY day::date
    ORDER BY day::date
  ), monthly AS (
    SELECT
      month::date AS month,
      COUNT(c.order_id)::integer AS delivered_orders,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery)::integer AS accepted_orders,
      COUNT(c.order_id) FILTER (WHERE c.pending_acceptance)::integer AS pending_acceptance,
      COALESCE(SUM(c.order_amount), 0)::numeric AS total_sales,
      COALESCE(SUM(c.cash_collected_amount), 0)::numeric AS cash_amount,
      COUNT(c.order_id) FILTER (WHERE c.cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(c.cash_pending_amount), 0)::numeric AS cash_on_hand,
      COUNT(c.order_id) FILTER (WHERE c.cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(c.transfer_amount), 0)::numeric AS transfer_amount,
      COUNT(c.order_id) FILTER (WHERE c.transfer_amount > 0)::integer AS transfer_order_count
    FROM generate_series(
      date_trunc('month', p_range_from::timestamp),
      date_trunc('month', p_range_to::timestamp),
      interval '1 month'
    ) month
    LEFT JOIN cohort c
      ON c.effective_assignment_date >= month::date
      AND c.effective_assignment_date < (month + interval '1 month')::date
    GROUP BY month::date
    ORDER BY month::date
  )
  SELECT jsonb_build_object(
    'timezone', 'Asia/Brunei',
    'summary', jsonb_build_object(
      'deliveredOrders', metrics.delivered_orders,
      'totalSales', metrics.total_sales,
      'cashAmount', metrics.cash_amount,
      'cashOrderCount', metrics.cash_order_count,
      'cashOnHand', metrics.cash_on_hand,
      'cashOnHandCount', metrics.cash_on_hand_count,
      'transferAmount', metrics.transfer_amount,
      'transferOrderCount', metrics.transfer_order_count,
      'pendingAcceptance', metrics.pending_acceptance,
      'pendingAcceptanceAmount', metrics.pending_acceptance_amount,
      'runnerAcceptedOrders', metrics.accepted_orders,
      'runnerAcceptedAmount', metrics.accepted_sales
    ),
    'daily', COALESCE((SELECT jsonb_agg(to_jsonb(daily) ORDER BY daily.date) FROM daily), '[]'::jsonb),
    'monthly', COALESCE((SELECT jsonb_agg(to_jsonb(monthly) ORDER BY monthly.month) FROM monthly), '[]'::jsonb)
  ) INTO v_result
  FROM range_metrics metrics;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_analytics_day(
  p_driver_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_role text := public.get_user_role(v_actor_id)::text;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL OR (v_actor_id <> p_driver_id AND v_role <> 'admin') THEN
    RAISE EXCEPTION 'Driver Analytics details are only available to the Driver or an administrator';
  END IF;

  WITH cohort AS MATERIALIZED (
    SELECT * FROM private.get_driver_analytics_cohort(p_driver_id, p_date, p_date)
  ), details AS (
    SELECT
      cohort.*,
      to_jsonb(o) || jsonb_build_object(
        'operational_date', cohort.effective_assignment_date,
        'effective_assignment_date', cohort.effective_assignment_date,
        'assignment_timestamp', cohort.assignment_timestamp,
        'assignment_source', cohort.assignment_source,
        'driver_event_date', cohort.effective_assignment_date,
        'driver_event_timestamp', cohort.assignment_timestamp,
        'assignment_state', cohort.assignment_state,
        'collect_amount', cohort.order_amount,
        'cash_amount', cohort.cash_collected_amount,
        'transfer_amount', cohort.transfer_amount,
        'cash_on_hand_amount', cohort.cash_pending_amount,
        'cash_settlement_status', cohort.cash_settlement_status,
        'reassigned', false,
        'order_items', COALESCE(items.order_items, '[]'::jsonb)
      ) AS order_data
    FROM cohort
    JOIN public.orders o ON o.id = cohort.order_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        to_jsonb(item) || jsonb_build_object(
          'product', CASE WHEN product.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', product.id,
            'sku_code', product.sku_code,
            'sku_name', product.sku_name
          ) END
        ) ORDER BY item.created_at, item.id
      ) AS order_items
      FROM public.order_items item
      LEFT JOIN public.products product ON product.id = item.product_id
      WHERE item.order_id = o.id
    ) items ON true
  )
  SELECT jsonb_build_object(
    'date', p_date,
    'summary', jsonb_build_object(
      'deliveredOrders', COUNT(*)::integer,
      'totalSales', COALESCE(SUM(order_amount), 0),
      'cashAmount', COALESCE(SUM(cash_collected_amount), 0),
      'cashOrderCount', COUNT(*) FILTER (WHERE cash_collected_amount > 0)::integer,
      'cashOnHand', COALESCE(SUM(cash_pending_amount), 0),
      'cashOnHandCount', COUNT(*) FILTER (WHERE cash_pending_amount > 0)::integer,
      'transferAmount', COALESCE(SUM(transfer_amount), 0),
      'transferOrderCount', COUNT(*) FILTER (WHERE transfer_amount > 0)::integer,
      'pendingAcceptance', COUNT(*) FILTER (WHERE pending_acceptance)::integer,
      'pendingAcceptanceAmount', COALESCE(SUM(order_amount) FILTER (WHERE pending_acceptance), 0),
      'runnerAcceptedOrders', COUNT(*) FILTER (WHERE accepted_delivery)::integer,
      'runnerAcceptedAmount', COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)
    ),
    'orders', COALESCE(jsonb_agg(order_data ORDER BY assignment_timestamp, order_id), '[]'::jsonb)
  ) INTO v_result
  FROM details;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION private.driver_analytics_event_date(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.driver_analytics_reported_payment_components(numeric, text, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_driver_analytics_day(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_analytics_day(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) IS
  'Driver-delivered event totals grouped by driver_delivered_at in Asia/Brunei.';
COMMENT ON FUNCTION public.get_driver_analytics_day(uuid, date) IS
  'Driver-delivered event detail for one Asia/Brunei date; excludes assignment-only and Runner-direct outcomes.';
