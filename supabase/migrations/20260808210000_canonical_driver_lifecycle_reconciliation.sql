-- Reconcile every Driver-facing count from one lifecycle source.
-- Pending Driver outcomes win over stale legacy runner_status values until the
-- Runner explicitly accepts/rejects the submission.

CREATE OR REPLACE FUNCTION public.get_driver_assignment_source(
  p_runner_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_active_only boolean DEFAULT false,
  p_include_items boolean DEFAULT true
)
RETURNS TABLE (
  order_id uuid,
  order_code text,
  runner_id uuid,
  driver_id uuid,
  driver_name text,
  operational_date date,
  assignment_state text,
  is_active_assignment boolean,
  collect_amount numeric,
  order_data jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.*,
      COALESCE(
        private.driver_analytics_assignment_date(
          o.driver_assigned_at,
          batch.created_at,
          assignment_audit.created_at
        ),
        public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
      ) AS effective_assignment_date,
      COALESCE(o.driver_assigned_at, batch.created_at, assignment_audit.created_at, o.created_at) AS effective_assignment_timestamp,
      CASE
        WHEN o.driver_assigned_at IS NOT NULL THEN 'driver_assigned_at'
        WHEN batch.created_at IS NOT NULL THEN 'driver_assignment_batch'
        WHEN assignment_audit.created_at IS NOT NULL THEN 'assignment_audit'
        ELSE 'order_operational_date_fallback'
      END AS effective_assignment_source,
      public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_review_status::text, '') <> 'ACTION_REQUIRED'
        AND COALESCE(o.runner_final_outcome::text, '') <> 'NEED_SALESPERSON_FOLLOWUP'
        AS is_active,
      o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_review_status::text, '') <> 'ACTION_REQUIRED'
        AND COALESCE(o.runner_final_outcome::text, '') <> 'NEED_SALESPERSON_FOLLOWUP'
        AS is_pending_review
    FROM public.orders o
    LEFT JOIN public.driver_assignment_batches batch
      ON batch.id = o.driver_assignment_batch_id
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.action IN (
          'DRIVER_ASSIGNED',
          'DRIVER_REASSIGNED',
          'ORDER_ASSIGNED_TO_DRIVER'
        )
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) assignment_audit ON true
    WHERE o.driver_id IS NOT NULL
      AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND UPPER(COALESCE(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
      AND (
        p_date_from IS NULL
        OR COALESCE(
          private.driver_analytics_assignment_date(
            o.driver_assigned_at,
            batch.created_at,
            assignment_audit.created_at
          ),
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
        ) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR COALESCE(
          private.driver_analytics_assignment_date(
            o.driver_assigned_at,
            batch.created_at,
            assignment_audit.created_at
          ),
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
        ) <= p_date_to
      )
      AND (
        COALESCE(o.status::text, '') NOT IN (
          'DELIVERED', 'FAILED', 'FAILED_DELIVERY', 'COMPLETED', 'APPROVED',
          'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        OR (
          o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
          AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
          AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
          AND COALESCE(o.runner_status::text, '') NOT IN (
            'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
          )
        )
      )
  )
  SELECT
    scoped.id,
    scoped.order_code,
    scoped.runner_id,
    scoped.driver_id,
    COALESCE(driver_profile.display_name, driver_profile.email, 'Unknown Driver')::text,
    public.order_operational_date(scoped.next_delivery_date, scoped.expected_pickup_date, scoped.order_date),
    CASE
      WHEN scoped.is_pending_review THEN 'PENDING_ACCEPTANCE'
      WHEN scoped.driver_status::text = 'DRIVER_DELIVERED'
        AND scoped.runner_accept_status::text = 'ACCEPTED'
        AND scoped.runner_status::text = 'DELIVERED'
        THEN 'DELIVERED'
      WHEN scoped.driver_status::text = 'DRIVER_FAILED'
        AND scoped.runner_accept_status::text = 'ACCEPTED'
        AND scoped.runner_status::text = 'FAILED_DELIVERY'
        THEN 'FAILED'
      WHEN scoped.is_active THEN 'ACTIVE'
      ELSE 'INACTIVE'
    END,
    scoped.is_active,
    public.order_collection_amount(scoped.payment_method::text, scoped.total_amount),
    to_jsonb(scoped)
      || jsonb_build_object(
        'effective_assignment_date', scoped.effective_assignment_date,
        'assignment_timestamp', scoped.effective_assignment_timestamp,
        'assignment_source', scoped.effective_assignment_source,
        'current_assignment_id', scoped.driver_assignment_batch_id,
        'canonical_lifecycle_state', CASE
          WHEN scoped.is_pending_review THEN 'PENDING_ACCEPTANCE'
          WHEN scoped.driver_status::text = 'DRIVER_DELIVERED'
            AND scoped.runner_accept_status::text = 'ACCEPTED'
            AND scoped.runner_status::text = 'DELIVERED'
            THEN 'DELIVERED'
          WHEN scoped.driver_status::text = 'DRIVER_FAILED'
            AND scoped.runner_accept_status::text = 'ACCEPTED'
            AND scoped.runner_status::text = 'FAILED_DELIVERY'
            THEN 'FAILED'
          WHEN scoped.is_active THEN 'ACTIVE'
          ELSE 'INACTIVE'
        END,
        'driver', jsonb_build_object(
          'id', driver_profile.id,
          'display_name', driver_profile.display_name,
          'email', driver_profile.email
        ),
        'order_items',
        CASE
          WHEN p_include_items THEN COALESCE((
            SELECT jsonb_agg(
              to_jsonb(oi)
              || jsonb_build_object(
                'product',
                CASE
                  WHEN product.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'id', product.id,
                    'sku_code', product.sku_code,
                    'sku_name', product.sku_name
                  )
                END
              )
              ORDER BY oi.created_at, oi.id
            )
            FROM public.order_items oi
            LEFT JOIN public.products product ON product.id = oi.product_id
            WHERE oi.order_id = scoped.id
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      )
  FROM scoped
  LEFT JOIN public.profiles driver_profile ON driver_profile.id = scoped.driver_id
  WHERE (
    p_active_only IS NOT TRUE
    OR scoped.is_active
    OR scoped.is_pending_review
  )
  AND (
    public.get_user_role(auth.uid())::text = 'admin'
    OR (
      public.get_user_role(auth.uid())::text = 'runner'
      AND scoped.runner_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid())::text = 'driver'
      AND scoped.driver_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = scoped.runner_id
        AND ra.is_active = true
        AND (
          ra.can_manage_driver_inbox = true
          OR ra.can_manage_driver_stock = true
          OR ra.can_view_driver_workload = true
        )
    )
  )
  ORDER BY scoped.effective_assignment_date DESC,
    scoped.effective_assignment_timestamp DESC,
    scoped.id;
$$;

REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) IS
  'Canonical Driver lifecycle source. Current active assignments and both unreviewed Driver outcomes remain visible; Runner-finalized outcomes are excluded from current Driver workload.';

-- Analytics financials and delivery counts are Runner-finalized metrics. The
-- frontend overlays the current pending-review source above using assignment
-- date, so a Driver submission can never be presented as final delivery.
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
      COUNT(*)::integer AS assigned_orders,
      COUNT(*) FILTER (WHERE accepted_delivery)::integer AS delivered_orders,
      COUNT(*) FILTER (WHERE accepted_failed)::integer AS accepted_failed_orders,
      COUNT(*) FILTER (WHERE accepted_delivery)::integer AS accepted_orders,
      COUNT(*) FILTER (WHERE pending_acceptance)::integer AS pending_acceptance,
      COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS total_sales,
      COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS accepted_sales,
      COALESCE(SUM(order_amount) FILTER (WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'), 0)::numeric AS pending_acceptance_amount,
      COALESCE(SUM(cash_collected_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS cash_amount,
      COUNT(*) FILTER (WHERE accepted_delivery AND cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(cash_pending_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS cash_on_hand,
      COUNT(*) FILTER (WHERE accepted_delivery AND cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(transfer_amount) FILTER (WHERE accepted_delivery), 0)::numeric AS transfer_amount,
      COUNT(*) FILTER (WHERE accepted_delivery AND transfer_amount > 0)::integer AS transfer_order_count
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
      COALESCE(SUM(c.order_amount) FILTER (WHERE c.pending_acceptance AND c.driver_status = 'DRIVER_DELIVERED'), 0)::numeric AS pending_acceptance_amount,
      COALESCE(SUM(c.cash_collected_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS cash_amount,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(c.cash_pending_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS cash_on_hand,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(c.transfer_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS transfer_amount,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.transfer_amount > 0)::integer AS transfer_order_count
    FROM generate_series(p_calendar_from, p_calendar_to, interval '1 day') day
    LEFT JOIN cohort c ON c.effective_assignment_date = day::date
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
      COALESCE(SUM(c.order_amount) FILTER (WHERE c.cash_collected_amount > 0 AND c.accepted_delivery), 0)::numeric AS cash_amount,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.cash_collected_amount > 0)::integer AS cash_order_count,
      COALESCE(SUM(c.cash_pending_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS cash_on_hand,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.cash_pending_amount > 0)::integer AS cash_on_hand_count,
      COALESCE(SUM(c.transfer_amount) FILTER (WHERE c.accepted_delivery), 0)::numeric AS transfer_amount,
      COUNT(c.order_id) FILTER (WHERE c.accepted_delivery AND c.transfer_amount > 0)::integer AS transfer_order_count
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
      'pendingAcceptance', COUNT(*) FILTER (WHERE pending_acceptance)::integer,
      'pendingAcceptanceAmount', COALESCE(SUM(order_amount) FILTER (WHERE pending_acceptance AND driver_status = 'DRIVER_DELIVERED'), 0),
      'runnerAcceptedOrders', COUNT(*) FILTER (WHERE accepted_delivery)::integer,
      'runnerAcceptedAmount', COALESCE(SUM(order_amount) FILTER (WHERE accepted_delivery), 0)
    ),
    'orders', COALESCE(jsonb_agg(order_data ORDER BY assignment_timestamp, order_id), '[]'::jsonb)
  ) INTO v_result
  FROM details;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_analytics(uuid, date, date, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_driver_analytics_day(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_analytics_day(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
