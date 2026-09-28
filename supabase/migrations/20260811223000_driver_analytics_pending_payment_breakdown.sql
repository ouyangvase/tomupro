-- Keep accepted cash/transfer separate from Driver-reported payments that are
-- still waiting for Runner review.  The latter must be visible in Analytics,
-- but must not become a Cash Settlement liability before Runner acceptance.

CREATE OR REPLACE FUNCTION private.driver_analytics_event_date(
  p_driver_delivered_at timestamptz
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT (p_driver_delivered_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
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
  ), payment_rows AS MATERIALIZED (
    SELECT
      cohort.*,
      payment.cash_amount AS pending_reported_cash_amount,
      payment.transfer_amount AS pending_reported_transfer_amount
    FROM cohort
    JOIN public.orders order_row ON order_row.id = cohort.order_id
    CROSS JOIN LATERAL private.driver_analytics_reported_payment_components(
      cohort.order_amount,
      cohort.payment_method,
      cohort.driver_payment_method,
      order_row.driver_cash_amount,
      order_row.driver_transfer_amount
    ) payment
  ), range_rows AS (
    SELECT * FROM payment_rows
    WHERE effective_assignment_date BETWEEN p_range_from AND p_range_to
  ), range_metrics AS (
    SELECT
      COUNT(*)::integer AS assigned_orders,
      COUNT(*) FILTER (WHERE accepted_delivery)::integer AS delivered_orders,
      COUNT(*) FILTER (WHERE accepted_failed)::integer AS accepted_failed_orders,
      COUNT(*) FILTER (WHERE accepted_delivery)::integer AS accepted_orders,
      COUNT(*) FILTER (WHERE pending_acceptance)::integer AS pending_acceptance,
      COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS total_sales,
      COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS accepted_sales,
      COALESCE(SUM(order_amount) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
      ), 0)::numeric AS pending_acceptance_amount,
      COALESCE(SUM(cash_collected_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS cash_amount,
      COUNT(*) FILTER (WHERE accepted_delivery AND cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(cash_pending_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS cash_on_hand,
      COUNT(*) FILTER (WHERE accepted_delivery AND cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(transfer_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS transfer_amount,
      COUNT(*) FILTER (WHERE accepted_delivery AND transfer_amount > 0)::integer AS transfer_order_count,
      COALESCE(SUM(pending_reported_cash_amount) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
      ), 0)::numeric AS pending_cash_amount,
      COUNT(*) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
          AND pending_reported_cash_amount > 0
      )::integer AS pending_cash_order_count,
      COALESCE(SUM(pending_reported_transfer_amount) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
      ), 0)::numeric AS pending_transfer_amount,
      COUNT(*) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
          AND pending_reported_transfer_amount > 0
      )::integer AS pending_transfer_order_count
    FROM range_rows
  ), daily AS (
    SELECT
      day::date AS date,
      COUNT(c.order_id)::integer AS assigned_orders,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery)::integer AS delivered_orders,
      COUNT(c.order_id) FILTER (WHERE c.accepted_failed)::integer AS accepted_failed_orders,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery)::integer AS accepted_orders,
      COUNT(c.order_id) FILTER (WHERE c.pending_acceptance)::integer AS pending_acceptance,
      COALESCE(SUM(c.order_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS total_sales,
      COALESCE(SUM(c.order_amount) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
      ), 0)::numeric AS pending_acceptance_amount,
      COALESCE(SUM(c.cash_collected_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS cash_amount,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(c.cash_pending_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS cash_on_hand,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(c.transfer_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS transfer_amount,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.transfer_amount > 0)::integer AS transfer_order_count,
      COALESCE(SUM(c.pending_reported_cash_amount) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
      ), 0)::numeric AS pending_cash_amount,
      COUNT(c.order_id) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
          AND c.pending_reported_cash_amount > 0
      )::integer AS pending_cash_order_count,
      COALESCE(SUM(c.pending_reported_transfer_amount) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
      ), 0)::numeric AS pending_transfer_amount,
      COUNT(c.order_id) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
          AND c.pending_reported_transfer_amount > 0
      )::integer AS pending_transfer_order_count
    FROM generate_series(p_calendar_from, p_calendar_to, interval '1 day') day
    LEFT JOIN payment_rows c ON c.effective_assignment_date = day::date
    GROUP BY day::date
    ORDER BY day::date
  ), monthly AS (
    SELECT
      month::date AS month,
      COUNT(c.order_id)::integer AS assigned_orders,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery)::integer AS delivered_orders,
      COUNT(c.order_id) FILTER (WHERE c.accepted_failed)::integer AS accepted_failed_orders,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery)::integer AS accepted_orders,
      COUNT(c.order_id) FILTER (WHERE c.pending_acceptance)::integer AS pending_acceptance,
      COALESCE(SUM(c.order_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS total_sales,
      COALESCE(SUM(c.cash_collected_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS cash_amount,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(c.cash_pending_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS cash_on_hand,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(c.transfer_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS transfer_amount,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.transfer_amount > 0)::integer AS transfer_order_count,
      COALESCE(SUM(c.pending_reported_cash_amount) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
      ), 0)::numeric AS pending_cash_amount,
      COUNT(c.order_id) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
          AND c.pending_reported_cash_amount > 0
      )::integer AS pending_cash_order_count,
      COALESCE(SUM(c.pending_reported_transfer_amount) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
      ), 0)::numeric AS pending_transfer_amount,
      COUNT(c.order_id) FILTER (
        WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'
          AND c.pending_reported_transfer_amount > 0
      )::integer AS pending_transfer_order_count
    FROM generate_series(
      date_trunc('month', p_range_from::timestamp),
      date_trunc('month', p_range_to::timestamp),
      interval '1 month'
    ) month
    LEFT JOIN payment_rows c
      ON c.effective_assignment_date >= month::date
      AND c.effective_assignment_date < (month + interval '1 month')::date
    GROUP BY month::date
    ORDER BY month::date
  )
  SELECT jsonb_build_object(
    'timezone', 'Asia/Kuala_Lumpur',
    'summary', jsonb_build_object(
      'assignedOrders', metrics.assigned_orders,
      'deliveredOrders', metrics.delivered_orders,
      'acceptedFailedOrders', metrics.accepted_failed_orders,
      'totalSales', metrics.total_sales,
      'cashAmount', metrics.cash_amount,
      'cashOrderCount', metrics.cash_order_count,
      'cashOnHand', metrics.cash_on_hand,
      'cashOnHandCount', metrics.cash_on_hand_count,
      'transferAmount', metrics.transfer_amount,
      'transferOrderCount', metrics.transfer_order_count,
      'pendingCashAmount', metrics.pending_cash_amount,
      'pendingCashOrderCount', metrics.pending_cash_order_count,
      'pendingTransferAmount', metrics.pending_transfer_amount,
      'pendingTransferOrderCount', metrics.pending_transfer_order_count,
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

CREATE OR REPLACE FUNCTION public.get_driver_analytics_day(p_driver_id uuid, p_date date)
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
  ), payment_rows AS MATERIALIZED (
    SELECT
      cohort.*,
      payment.cash_amount AS pending_reported_cash_amount,
      payment.transfer_amount AS pending_reported_transfer_amount
    FROM cohort
    JOIN public.orders order_row ON order_row.id = cohort.order_id
    CROSS JOIN LATERAL private.driver_analytics_reported_payment_components(
      cohort.order_amount,
      cohort.payment_method,
      cohort.driver_payment_method,
      order_row.driver_cash_amount,
      order_row.driver_transfer_amount
    ) payment
  ), details AS (
    SELECT
      payment_rows.*,
      to_jsonb(o) || jsonb_build_object(
        'operational_date', payment_rows.effective_assignment_date,
        'effective_assignment_date', payment_rows.effective_assignment_date,
        'assignment_timestamp', payment_rows.assignment_timestamp,
        'assignment_source', payment_rows.assignment_source,
        'driver_event_date', payment_rows.effective_assignment_date,
        'driver_event_timestamp', payment_rows.assignment_timestamp,
        'assignment_state', payment_rows.assignment_state,
        'collect_amount', payment_rows.order_amount,
        'cash_amount', payment_rows.cash_collected_amount,
        'transfer_amount', payment_rows.transfer_amount,
        'pending_cash_amount', payment_rows.pending_reported_cash_amount,
        'pending_transfer_amount', payment_rows.pending_reported_transfer_amount,
        'cash_on_hand_amount', payment_rows.cash_pending_amount,
        'cash_settlement_status', payment_rows.cash_settlement_status,
        'reassigned', false,
        'order_items', COALESCE(items.order_items, '[]'::jsonb)
      ) AS order_data
    FROM payment_rows
    JOIN public.orders o ON o.id = payment_rows.order_id
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
      'assignedOrders', COUNT(*)::integer,
      'deliveredOrders', COUNT(*) FILTER (WHERE accepted_delivery)::integer,
      'acceptedFailedOrders', COUNT(*) FILTER (WHERE accepted_failed)::integer,
      'totalSales', COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0),
      'cashAmount', COALESCE(SUM(cash_collected_amount) FILTER (WHERE accepted_delivery), 0),
      'cashOrderCount', COUNT(*) FILTER (WHERE accepted_delivery AND cash_collected_amount > 0)::integer,
      'cashOnHand', COALESCE(SUM(cash_pending_amount) FILTER (WHERE accepted_delivery), 0),
      'cashOnHandCount', COUNT(*) FILTER (WHERE accepted_delivery AND cash_pending_amount > 0)::integer,
      'transferAmount', COALESCE(SUM(transfer_amount) FILTER (WHERE accepted_delivery), 0),
      'transferOrderCount', COUNT(*) FILTER (WHERE accepted_delivery AND transfer_amount > 0)::integer,
      'pendingCashAmount', COALESCE(SUM(pending_reported_cash_amount) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
      ), 0),
      'pendingCashOrderCount', COUNT(*) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
          AND pending_reported_cash_amount > 0
      )::integer,
      'pendingTransferAmount', COALESCE(SUM(pending_reported_transfer_amount) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
      ), 0),
      'pendingTransferOrderCount', COUNT(*) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
          AND pending_reported_transfer_amount > 0
      )::integer,
      'pendingAcceptance', COUNT(*) FILTER (WHERE pending_acceptance)::integer,
      'pendingAcceptanceAmount', COALESCE(SUM(order_amount) FILTER (
        WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'
      ), 0),
      'runnerAcceptedOrders', COUNT(*) FILTER (WHERE accepted_delivery)::integer,
      'runnerAcceptedAmount', COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)
    ),
    'orders', COALESCE(jsonb_agg(order_data ORDER BY assignment_timestamp, order_id), '[]'::jsonb)
  ) INTO v_result
  FROM details;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driver_analytics_day(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_analytics_day(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) IS
  'Driver Analytics uses Kuala Lumpur dates; accepted payment and pending Driver-reported payment are separate totals.';
COMMENT ON FUNCTION public.get_driver_analytics_day(uuid, date) IS
  'Driver Analytics day detail uses Kuala Lumpur dates and exposes pending Driver-reported cash/transfer separately.';

NOTIFY pgrst, 'reload schema';
