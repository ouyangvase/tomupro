-- Driver Analytics uses assignment evidence only. It intentionally does not fall
-- back to order_date, delivery timestamps, or generic order operational dates.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.driver_analytics_effective_date(
  p_rescheduled_date date,
  p_explicit_assignment_date date,
  p_assigned_at timestamptz,
  p_batch_date date,
  p_assignment_audit_at timestamptz
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_rescheduled_date,
    p_explicit_assignment_date,
    (p_assigned_at AT TIME ZONE 'Asia/Brunei')::date,
    p_batch_date,
    (p_assignment_audit_at AT TIME ZONE 'Asia/Brunei')::date
  );
$$;

CREATE OR REPLACE FUNCTION private.driver_analytics_is_accepted_delivery(
  p_driver_status text,
  p_runner_accept_status text,
  p_runner_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE(p_driver_status, '') = 'DRIVER_DELIVERED'
    AND COALESCE(p_runner_accept_status, '') = 'ACCEPTED'
    AND COALESCE(p_runner_status, '') = 'DELIVERED';
$$;

CREATE OR REPLACE FUNCTION private.driver_analytics_payment_components(
  p_accepted_delivery boolean,
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
    CASE
      WHEN NOT p_accepted_delivery THEN 0::numeric
      WHEN p_driver_cash_amount IS NOT NULL THEN p_driver_cash_amount
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH' THEN p_order_amount
      WHEN p_driver_payment_method IS NULL
        AND upper(COALESCE(p_payment_method, '')) = 'COD' THEN p_order_amount
      ELSE 0::numeric
    END,
    CASE
      WHEN NOT p_accepted_delivery THEN 0::numeric
      WHEN p_driver_transfer_amount IS NOT NULL THEN p_driver_transfer_amount
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'TRANSFER' THEN p_order_amount
      WHEN p_driver_payment_method IS NULL
        AND upper(COALESCE(p_payment_method, '')) = 'TRANSFER' THEN p_order_amount
      ELSE 0::numeric
    END;
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
  WITH attributed AS (
    SELECT
      o.*,
      batch.operational_date AS batch_operational_date,
      batch.action AS batch_action,
      batch.old_driver_id AS batch_old_driver_id,
      batch.created_at AS batch_created_at,
      batch.result_summary AS batch_result_summary,
      assignment_audit.id AS assignment_audit_id,
      assignment_audit.created_at AS assignment_audit_at,
      reschedule_audit.new_date AS rescheduled_date,
      accepted_audit.created_at AS runner_accepted_audit_at,
      liability.open_amount AS liability_open_amount,
      liability.has_pending_handover AS liability_has_pending_handover,
      liability.has_settled AS liability_has_settled,
      CASE
        WHEN batch.result_summary->>'scope' = 'date' THEN batch.operational_date
        ELSE NULL
      END AS explicit_assignment_date
    FROM public.orders o
    LEFT JOIN public.driver_assignment_batches batch
      ON batch.id = o.driver_assignment_batch_id
    LEFT JOIN LATERAL (
      SELECT audit.id, audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.after_json->>'driver_id' = p_driver_id::text
        AND (
          upper(audit.action) LIKE '%DRIVER%ASSIGN%'
          OR upper(audit.action) LIKE '%DRIVER%CHANG%'
        )
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) assignment_audit ON true
    LEFT JOIN LATERAL (
      SELECT
        CASE
          WHEN (audit.after_json->>'next_delivery_date') ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (audit.after_json->>'next_delivery_date')::date
          ELSE NULL
        END AS new_date
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.action IN ('DRIVER_DELIVERY_DEFERRED', 'DRIVER_RESCHEDULE_ACCEPTED')
        AND audit.created_at >= COALESCE(
          o.driver_assigned_at,
          batch.created_at,
          assignment_audit.created_at,
          '-infinity'::timestamptz
        )
        AND (audit.after_json->>'next_delivery_date') ~ '^\d{4}-\d{2}-\d{2}$'
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) reschedule_audit ON true
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.action = 'DRIVER_DELIVERY_ACCEPTED'
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) accepted_audit ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(item.cash_amount) FILTER (
          WHERE item.status IN ('OPEN', 'PENDING_HANDOVER')
        ), 0)::numeric AS open_amount,
        COALESCE(bool_or(item.status = 'PENDING_HANDOVER'), false) AS has_pending_handover,
        COALESCE(bool_or(item.status = 'SETTLED'), false) AS has_settled
      FROM public.cash_liabilities item
      WHERE item.order_id = o.id
        AND item.driver_id = p_driver_id
    ) liability ON true
    WHERE o.driver_id = p_driver_id
      AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND upper(COALESCE(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
  ), normalized AS (
    SELECT
      attributed.*,
      private.driver_analytics_effective_date(
        attributed.rescheduled_date,
        attributed.explicit_assignment_date,
        attributed.driver_assigned_at,
        attributed.batch_operational_date,
        attributed.assignment_audit_at
      ) AS analytics_date,
      COALESCE(
        attributed.driver_assigned_at,
        attributed.batch_created_at,
        attributed.assignment_audit_at
      ) AS analytics_assigned_at,
      CASE
        WHEN attributed.rescheduled_date IS NOT NULL THEN 'accepted_reschedule'
        WHEN attributed.explicit_assignment_date IS NOT NULL THEN 'assignment_batch_operational_date'
        WHEN attributed.driver_assigned_at IS NOT NULL THEN 'driver_assigned_at_brunei'
        WHEN attributed.batch_operational_date IS NOT NULL THEN 'assignment_batch_fallback'
        WHEN attributed.assignment_audit_at IS NOT NULL THEN 'assignment_audit_brunei'
        ELSE NULL
      END AS analytics_source,
      private.driver_analytics_is_accepted_delivery(
        attributed.driver_status::text,
        attributed.runner_accept_status::text,
        attributed.runner_status::text
      ) AS is_accepted_delivery,
      (
        COALESCE(attributed.driver_status::text, '') = 'DRIVER_FAILED'
        AND COALESCE(attributed.runner_accept_status::text, '') = 'ACCEPTED'
        AND COALESCE(attributed.runner_status::text, '') = 'FAILED_DELIVERY'
      ) AS is_accepted_failed,
      public.order_collection_amount(
        attributed.payment_method::text,
        attributed.total_amount
      )::numeric AS analytics_amount
    FROM attributed
  ), financials AS (
    SELECT
      normalized.*,
      payment.cash_amount AS analytics_cash_amount,
      payment.transfer_amount AS analytics_transfer_amount
    FROM normalized
    CROSS JOIN LATERAL private.driver_analytics_payment_components(
      normalized.is_accepted_delivery,
      normalized.analytics_amount,
      normalized.payment_method::text,
      normalized.driver_payment_method,
      normalized.driver_cash_amount,
      normalized.driver_transfer_amount
    ) payment
    WHERE normalized.analytics_date IS NOT NULL
      AND (p_date_from IS NULL OR normalized.analytics_date >= p_date_from)
      AND (p_date_to IS NULL OR normalized.analytics_date <= p_date_to)
  )
  SELECT
    financials.id,
    financials.driver_id,
    financials.runner_id,
    financials.analytics_date,
    financials.analytics_assigned_at,
    financials.analytics_source,
    financials.driver_assignment_batch_id,
    (
      COALESCE(financials.batch_action, '') = 'REASSIGN'
      OR financials.batch_old_driver_id IS NOT NULL
    ),
    financials.analytics_amount,
    financials.payment_method::text,
    financials.driver_payment_method,
    CASE
      WHEN financials.is_accepted_delivery THEN 'DELIVERED'
      WHEN financials.is_accepted_failed THEN 'FAILED'
      WHEN financials.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(financials.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        THEN 'PENDING_ACCEPTANCE'
      ELSE 'ACTIVE'
    END,
    financials.is_accepted_delivery,
    financials.is_accepted_failed,
    (
      financials.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
      AND COALESCE(financials.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
    ),
    financials.analytics_cash_amount,
    financials.analytics_transfer_amount,
    CASE
      WHEN financials.is_accepted_delivery THEN COALESCE(financials.liability_open_amount, 0)
      ELSE 0::numeric
    END,
    CASE
      WHEN financials.analytics_cash_amount <= 0 THEN 'NOT_APPLICABLE'
      WHEN COALESCE(financials.liability_open_amount, 0) > 0
        AND financials.liability_has_pending_handover THEN 'PENDING_HANDOVER'
      WHEN COALESCE(financials.liability_open_amount, 0) > 0 THEN 'OPEN'
      WHEN financials.liability_has_settled THEN 'SETTLED'
      ELSE 'UNKNOWN'
    END,
    financials.driver_status::text,
    financials.runner_status::text,
    financials.runner_accept_status::text,
    COALESCE(financials.driver_delivered_at, financials.driver_failed_at),
    financials.runner_accepted_audit_at
  FROM financials
  ORDER BY financials.analytics_date, financials.analytics_assigned_at, financials.id;
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
    SELECT *
    FROM private.get_driver_analytics_cohort(
      p_driver_id,
      LEAST(p_range_from, p_calendar_from),
      GREATEST(p_range_to, p_calendar_to)
    )
  ), range_rows AS (
    SELECT * FROM cohort
    WHERE effective_assignment_date BETWEEN p_range_from AND p_range_to
  ), range_metrics AS (
    SELECT
      COUNT(*)::integer AS assigned,
      COUNT(*) FILTER (WHERE accepted_delivery)::integer AS delivered,
      COUNT(*) FILTER (WHERE accepted_failed)::integer AS failed,
      COUNT(*) FILTER (WHERE pending_acceptance)::integer AS pending_acceptance,
      (COUNT(*) - COUNT(*) FILTER (WHERE accepted_delivery))::integer AS pending,
      COALESCE(SUM(order_amount), 0)::numeric AS total_assigned_sales,
      COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS accepted_sales,
      COALESCE(SUM(order_amount) FILTER (WHERE NOT accepted_delivery), 0)::numeric AS pending_sales,
      COALESCE(SUM(cash_collected_amount), 0)::numeric AS cash_collected,
      COUNT(*) FILTER (WHERE cash_collected_amount > 0)::integer AS cash_collected_count,
      COALESCE(SUM(cash_pending_amount), 0)::numeric AS cash_pending,
      COUNT(*) FILTER (WHERE cash_pending_amount > 0)::integer AS cash_pending_count,
      COALESCE(SUM(transfer_amount), 0)::numeric AS transfer,
      COUNT(*) FILTER (WHERE transfer_amount > 0)::integer AS transfer_count,
      COALESCE(SUM(order_amount) FILTER (WHERE pending_acceptance), 0)::numeric AS pending_acceptance_amount
    FROM range_rows
  ), daily AS (
    SELECT
      day::date AS date,
      COUNT(c.order_id)::integer AS assigned,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery)::integer AS delivered,
      COUNT(c.order_id) FILTER (WHERE c.accepted_failed)::integer AS failed,
      COUNT(c.order_id) FILTER (WHERE c.pending_acceptance)::integer AS pending_acceptance,
      (COUNT(c.order_id) - COUNT(c.order_id) FILTER (WHERE c.accepted_delivery))::integer AS pending,
      COALESCE(SUM(c.order_amount), 0)::numeric AS total_assigned_sales,
      COALESCE(SUM(c.order_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS accepted_sales,
      COALESCE(SUM(c.order_amount) FILTER (WHERE NOT c.accepted_delivery), 0)::numeric AS pending_sales,
      COALESCE(SUM(c.cash_collected_amount), 0)::numeric AS cash_collected,
      COUNT(c.order_id) FILTER (WHERE c.cash_collected_amount > 0)::integer AS cash_collected_count,
      COALESCE(SUM(c.cash_pending_amount), 0)::numeric AS cash_pending,
      COUNT(c.order_id) FILTER (WHERE c.cash_pending_amount > 0)::integer AS cash_pending_count,
      COALESCE(SUM(c.transfer_amount), 0)::numeric AS transfer,
      COUNT(c.order_id) FILTER (WHERE c.transfer_amount > 0)::integer AS transfer_count,
      COALESCE(SUM(c.order_amount) FILTER (WHERE c.pending_acceptance), 0)::numeric AS pending_acceptance_amount
    FROM generate_series(p_calendar_from, p_calendar_to, interval '1 day') day
    LEFT JOIN cohort c ON c.effective_assignment_date = day::date
    GROUP BY day::date
    ORDER BY day::date
  ), monthly AS (
    SELECT
      month::date AS month,
      COUNT(c.order_id)::integer AS assigned,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery)::integer AS delivered,
      COUNT(c.order_id) FILTER (WHERE c.accepted_failed)::integer AS failed,
      (COUNT(c.order_id) - COUNT(c.order_id) FILTER (WHERE c.accepted_delivery))::integer AS pending,
      COALESCE(SUM(c.order_amount), 0)::numeric AS total_assigned_sales,
      COALESCE(SUM(c.order_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS accepted_sales,
      COALESCE(SUM(c.order_amount) FILTER (WHERE NOT c.accepted_delivery), 0)::numeric AS pending_sales,
      COALESCE(SUM(c.cash_collected_amount), 0)::numeric AS cash_collected,
      COALESCE(SUM(c.cash_pending_amount), 0)::numeric AS cash_pending,
      COALESCE(SUM(c.transfer_amount), 0)::numeric AS transfer
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
      'assigned', metrics.assigned,
      'delivered', metrics.delivered,
      'deliveryRate', CASE WHEN metrics.assigned = 0 THEN 0 ELSE round(metrics.delivered * 100.0 / metrics.assigned, 1) END,
      'failed', metrics.failed,
      'pending', metrics.pending,
      'pendingAcceptance', metrics.pending_acceptance,
      'pendingAcceptanceAmount', metrics.pending_acceptance_amount,
      'totalAssignedSales', metrics.total_assigned_sales,
      'acceptedSales', metrics.accepted_sales,
      'pendingSales', metrics.pending_sales,
      'cashCollected', metrics.cash_collected,
      'cashCollectedCount', metrics.cash_collected_count,
      'cashPendingSettlement', metrics.cash_pending,
      'cashPendingSettlementCount', metrics.cash_pending_count,
      'transfer', metrics.transfer,
      'transferCount', metrics.transfer_count
    ),
    'daily', COALESCE((SELECT jsonb_agg(to_jsonb(daily) ORDER BY daily.date) FROM daily), '[]'::jsonb),
    'monthly', COALESCE((SELECT jsonb_agg(to_jsonb(monthly) ORDER BY monthly.month) FROM monthly), '[]'::jsonb)
  )
  INTO v_result
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
      to_jsonb(o)
        || jsonb_build_object(
          'operational_date', cohort.effective_assignment_date,
          'effective_assignment_date', cohort.effective_assignment_date,
          'assignment_timestamp', cohort.assignment_timestamp,
          'assignment_source', cohort.assignment_source,
          'assignment_state', cohort.assignment_state,
          'collect_amount', cohort.order_amount,
          'cash_settlement_status', cohort.cash_settlement_status,
          'reassigned', cohort.reassigned,
          'order_items', COALESCE(items.order_items, '[]'::jsonb)
        ) AS order_data
    FROM cohort
    JOIN public.orders o ON o.id = cohort.order_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        to_jsonb(item)
          || jsonb_build_object(
            'product', CASE
              WHEN product.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', product.id,
                'sku_code', product.sku_code,
                'sku_name', product.sku_name
              )
            END
          )
        ORDER BY item.created_at, item.id
      ) AS order_items
      FROM public.order_items item
      LEFT JOIN public.products product ON product.id = item.product_id
      WHERE item.order_id = o.id
    ) items ON true
  )
  SELECT jsonb_build_object(
    'date', p_date,
    'summary', jsonb_build_object(
      'assigned', COUNT(*)::integer,
      'delivered', COUNT(*) FILTER (WHERE accepted_delivery)::integer,
      'failed', COUNT(*) FILTER (WHERE accepted_failed)::integer,
      'pending', (COUNT(*) - COUNT(*) FILTER (WHERE accepted_delivery))::integer,
      'pendingAcceptance', COUNT(*) FILTER (WHERE pending_acceptance)::integer,
      'pendingAcceptanceAmount', COALESCE(SUM(order_amount) FILTER (WHERE pending_acceptance), 0),
      'totalAssignedSales', COALESCE(SUM(order_amount), 0),
      'acceptedSales', COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0),
      'pendingSales', COALESCE(SUM(order_amount) FILTER (WHERE NOT accepted_delivery), 0),
      'cashCollected', COALESCE(SUM(cash_collected_amount), 0),
      'cashCollectedCount', COUNT(*) FILTER (WHERE cash_collected_amount > 0)::integer,
      'cashPendingSettlement', COALESCE(SUM(cash_pending_amount), 0),
      'cashPendingSettlementCount', COUNT(*) FILTER (WHERE cash_pending_amount > 0)::integer,
      'transfer', COALESCE(SUM(transfer_amount), 0),
      'transferCount', COUNT(*) FILTER (WHERE transfer_amount > 0)::integer
    ),
    'orders', COALESCE(jsonb_agg(order_data ORDER BY assignment_timestamp, order_id), '[]'::jsonb)
  )
  INTO v_result
  FROM details;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION private.driver_analytics_effective_date(date, date, timestamptz, date, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.driver_analytics_is_accepted_delivery(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.driver_analytics_payment_components(boolean, numeric, text, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_driver_analytics_day(uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_analytics_day(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) IS
  'Driver Analytics aggregates grouped only by evidenced Driver assignment dates in Asia/Brunei.';
COMMENT ON FUNCTION public.get_driver_analytics_day(uuid, date) IS
  'Lazy Driver Analytics day details using the same canonical assignment cohort as summary aggregates.';
