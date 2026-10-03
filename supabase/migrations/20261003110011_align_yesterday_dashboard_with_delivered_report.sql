-- Use the Delivered Orders completion timestamp for the Admin Yesterday numerator.
-- Keep disabled/resigned runners out of the active Admin Operations runner list.
-- Admin Operations Control Tower aggregate.
-- Uses the canonical runner assignment cohort so Admin Home, Runner
-- Performance and Finance Overview share the same operational date rules.

CREATE OR REPLACE FUNCTION public.get_admin_operations_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_today DATE := (now() AT TIME ZONE 'Asia/Brunei')::DATE;
  v_yesterday DATE := v_today - 1;
  v_month_start DATE := date_trunc('month', v_today::TIMESTAMP)::DATE;
  v_previous_month_start DATE := (v_month_start - INTERVAL '1 month')::DATE;
  v_previous_month_end DATE := v_month_start - 1;
  v_result JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_role := public.get_user_role(v_actor)::TEXT;
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Admin operations dashboard is only available to administrators' USING ERRCODE = '42501';
  END IF;

  WITH cohort AS MATERIALIZED (
    SELECT *
    FROM private.get_runner_performance_cohort(NULL, v_previous_month_start, v_today)
  ),
  active_cohort AS (
    SELECT * FROM cohort WHERE NOT is_excluded
  ),
  completed_yesterday AS (
    SELECT COUNT(*)::INT AS total
    FROM public.orders o
    WHERE o.current_operational_state::TEXT = 'DELIVERED'
      AND o.order_type::TEXT <> 'MIRI_INBOUND_PICKUP'
      AND (COALESCE(o.driver_delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Brunei')::DATE = v_yesterday
  ),
  yesterday_metrics AS (
    SELECT
      COUNT(*)::INT AS total,
      (SELECT total FROM completed_yesterday) AS delivered,
      COUNT(*) FILTER (WHERE result = 'FAILED')::INT AS failed,
      COUNT(*) FILTER (WHERE result = 'RESCHEDULED')::INT AS rescheduled,
      COUNT(*) FILTER (WHERE result = 'PENDING')::INT AS pending
    FROM active_cohort
    WHERE effective_assignment_date = v_yesterday
  ),
  month_metrics AS (
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE result = 'DELIVERED')::INT AS delivered,
      COUNT(*) FILTER (WHERE result = 'FAILED')::INT AS failed,
      COUNT(*) FILTER (WHERE result = 'RESCHEDULED')::INT AS rescheduled,
      COUNT(*) FILTER (WHERE result = 'PENDING')::INT AS pending
    FROM active_cohort
    WHERE effective_assignment_date >= v_month_start
      AND effective_assignment_date <= v_today
  ),
  previous_month_metrics AS (
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE result = 'DELIVERED')::INT AS delivered
    FROM active_cohort
    WHERE effective_assignment_date BETWEEN v_previous_month_start AND v_previous_month_end
  ),
  today_scope AS (
    SELECT DISTINCT o.id, o.current_operational_state::TEXT AS current_state, o.runner_status::TEXT AS runner_status, o.runner_id,
      (o.next_delivery_date = v_today OR o.driver_next_delivery_date = v_today) AS rescheduled_today
    FROM public.orders o
    WHERE o.status::TEXT NOT IN ('CANCELLED', 'CANCELED')
      AND COALESCE(o.current_operational_state, '') NOT IN ('DELIVERED', 'CANCELLED')
      AND (
        o.order_date = v_today
        OR o.expected_pickup_date = v_today
        OR o.next_delivery_date = v_today
        OR o.driver_next_delivery_date = v_today
        OR (o.runner_assigned_at AT TIME ZONE 'Asia/Brunei')::DATE = v_today
        OR EXISTS (
          SELECT 1 FROM active_cohort c
          WHERE c.order_id = o.id AND c.effective_assignment_date = v_today
        )
      )
  ),
  today_metrics AS (
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE current_state = 'READY')::INT AS ready,
      COUNT(*) FILTER (WHERE runner_id IS NOT NULL AND runner_status IN ('ASSIGNED', 'TAKEN'))::INT AS assigned,
      COUNT(*) FILTER (WHERE runner_id IS NULL OR runner_status = 'UNASSIGNED')::INT AS unassigned,
      COUNT(*) FILTER (WHERE rescheduled_today)::INT AS rescheduled_today
    FROM today_scope
  ),
  attention_scope AS (
    SELECT DISTINCT o.id,
      (
        COALESCE(o.current_operational_state, '') = 'READY'
        AND (o.runner_id IS NULL OR o.runner_status::TEXT = 'UNASSIGNED')
      ) AS is_unassigned,
      (
        (
          o.salesperson_action_required = true
          AND o.runner_status::TEXT <> 'DELIVERED'
        )
        OR (
          o.runner_status::TEXT = 'FAILED_DELIVERY'
          AND o.status::TEXT = 'READY'
        )
      ) AS is_failed,
      (
        o.next_delivery_date IS NOT NULL
        OR o.driver_next_delivery_date IS NOT NULL
        OR o.salesperson_action_type = 'RESCHEDULE_DELIVERY'
        OR o.runner_final_outcome = 'RESCHEDULE'
      ) AS is_rescheduled,
      (
        o.current_operational_state IN ('READY', 'ACTION_REQUIRED')
        AND o.created_at < now() - INTERVAL '24 hours'
      ) AS is_pending_24h,
      COALESCE(o.payment_history_unverified, false) AS is_payment_issue
    FROM public.orders o
    WHERE o.status::TEXT NOT IN ('CANCELLED', 'CANCELED')
      AND COALESCE(o.current_operational_state, '') NOT IN ('DELIVERED', 'CANCELLED')
      AND (
        (
          COALESCE(o.current_operational_state, '') = 'READY'
          AND (o.runner_id IS NULL OR o.runner_status::TEXT = 'UNASSIGNED')
        )
        OR (
          (o.salesperson_action_required = true AND o.runner_status::TEXT <> 'DELIVERED')
          OR (o.runner_status::TEXT = 'FAILED_DELIVERY' AND o.status::TEXT = 'READY')
        )
        OR o.next_delivery_date IS NOT NULL
        OR o.driver_next_delivery_date IS NOT NULL
        OR o.salesperson_action_type = 'RESCHEDULE_DELIVERY'
        OR o.runner_final_outcome = 'RESCHEDULE'
        OR (o.current_operational_state IN ('READY', 'ACTION_REQUIRED') AND o.created_at < now() - INTERVAL '24 hours')
        OR COALESCE(o.payment_history_unverified, false)
      )
  ),
  attention_metrics AS (
    SELECT
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE is_unassigned)::INT AS unassigned,
      COUNT(*) FILTER (WHERE is_failed)::INT AS failed,
      COUNT(*) FILTER (WHERE is_rescheduled)::INT AS rescheduled,
      COUNT(*) FILTER (WHERE is_pending_24h)::INT AS pending_24h,
      COUNT(*) FILTER (WHERE is_payment_issue)::INT AS payment_issues
    FROM attention_scope
  ),
  outstanding_orders AS (
    SELECT o.id, o.runner_id, o.area, o.total_amount, o.delivered_at
    FROM public.orders o
    WHERE o.status::TEXT NOT IN ('CANCELLED', 'CANCELED')
      AND o.runner_status::TEXT = 'DELIVERED'
      AND o.reconciliation_status::TEXT = 'NOT_CLAIMED'
      AND o.delivered_at IS NOT NULL
  ),
  outstanding_summary AS (
    SELECT
      COALESCE(SUM(total_amount), 0)::NUMERIC AS amount,
      COUNT(DISTINCT runner_id)::INT AS runners,
      COALESCE((v_today - MIN((delivered_at AT TIME ZONE 'Asia/Brunei')::DATE)), 0)::INT AS oldest_days
    FROM outstanding_orders
  ),
  outstanding_by_runner AS (
    SELECT
      o.runner_id,
      COALESCE(p.display_name, 'Unassigned runner') AS runner_name,
      STRING_AGG(DISTINCT NULLIF(o.area, ''), ', ' ORDER BY NULLIF(o.area, '')) AS areas,
      SUM(o.total_amount)::NUMERIC AS amount,
      COUNT(*)::INT AS order_count,
      (v_today - MIN((o.delivered_at AT TIME ZONE 'Asia/Brunei')::DATE))::INT AS oldest_days
    FROM outstanding_orders o
    LEFT JOIN public.profiles p ON p.id = o.runner_id
    GROUP BY o.runner_id, p.display_name
  ),
  runner_rows AS (
    SELECT
      p.id AS runner_id,
      COALESCE(p.display_name, p.email, 'Unknown runner') AS runner_name,
      COALESCE(STRING_AGG(DISTINCT NULLIF(c.area, ''), ', ' ORDER BY NULLIF(c.area, '')) FILTER (WHERE c.area IS NOT NULL), '') AS areas,
      COUNT(c.*) FILTER (WHERE c.effective_assignment_date = v_yesterday)::INT AS yesterday_total,
      (
        SELECT COUNT(*)::INT
        FROM public.orders delivered_order
        WHERE delivered_order.runner_id = p.id
          AND delivered_order.current_operational_state::TEXT = 'DELIVERED'
          AND delivered_order.order_type::TEXT <> 'MIRI_INBOUND_PICKUP'
          AND (COALESCE(delivered_order.driver_delivered_at, delivered_order.delivered_at) AT TIME ZONE 'Asia/Brunei')::DATE = v_yesterday
      ) AS yesterday_delivered,
      COUNT(c.*) FILTER (WHERE c.effective_assignment_date >= v_month_start AND c.effective_assignment_date <= v_today)::INT AS month_total,
      COUNT(c.*) FILTER (WHERE c.effective_assignment_date >= v_month_start AND c.effective_assignment_date <= v_today AND c.result = 'DELIVERED')::INT AS month_delivered,
      COALESCE(ob.amount, 0)::NUMERIC AS outstanding_amount,
      COALESCE(ob.order_count, 0)::INT AS outstanding_orders,
      COALESCE(ob.oldest_days, 0)::INT AS outstanding_oldest_days
    FROM public.profiles p
    LEFT JOIN active_cohort c ON c.runner_id = p.id
    LEFT JOIN outstanding_by_runner ob ON ob.runner_id = p.id
    WHERE p.role::TEXT = 'runner'
      AND p.is_active = true
      AND p.status::TEXT = 'active'
    GROUP BY p.id, p.display_name, p.email, ob.amount, ob.order_count, ob.oldest_days
  ),
  runner_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'runnerId', runner_id,
        'runnerName', runner_name,
        'areas', areas,
        'yesterday', jsonb_build_object(
          'total', yesterday_total,
          'delivered', yesterday_delivered,
          'rate', CASE WHEN yesterday_total = 0 THEN NULL ELSE ROUND(yesterday_delivered * 100.0 / yesterday_total, 1) END
        ),
        'month', jsonb_build_object(
          'total', month_total,
          'delivered', month_delivered,
          'rate', CASE WHEN month_total = 0 THEN NULL ELSE ROUND(month_delivered * 100.0 / month_total, 1) END
        ),
        'outstanding', jsonb_build_object(
          'amount', outstanding_amount,
          'orders', outstanding_orders,
          'oldestDays', outstanding_oldest_days
        )
      )
      ORDER BY
        CASE WHEN month_total > month_delivered OR outstanding_amount > 0 THEN 0 ELSE 1 END,
        outstanding_amount DESC,
        CASE WHEN month_total = 0 THEN 101 ELSE month_delivered * 100.0 / month_total END ASC,
        runner_name
    ), '[]'::JSONB) AS value
    FROM runner_rows
  )
  SELECT jsonb_build_object(
    'timeZone', 'Asia/Brunei',
    'asOfDate', v_today,
    'outstanding', jsonb_build_object(
      'amount', outstanding_summary.amount,
      'runners', outstanding_summary.runners,
      'oldestDays', outstanding_summary.oldest_days,
      'byRunner', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'runnerId', runner_id,
        'runnerName', runner_name,
        'areas', areas,
        'amount', amount,
        'orders', order_count,
        'oldestDays', oldest_days
      ) ORDER BY amount DESC, runner_name) FROM outstanding_by_runner), '[]'::JSONB)
    ),
    'yesterday', jsonb_build_object(
      'date', v_yesterday,
      'total', yesterday_metrics.total,
      'delivered', yesterday_metrics.delivered,
      'failed', yesterday_metrics.failed,
      'rescheduled', yesterday_metrics.rescheduled,
      'pending', yesterday_metrics.pending,
      'rate', CASE WHEN yesterday_metrics.total = 0 THEN NULL ELSE ROUND(yesterday_metrics.delivered * 100.0 / yesterday_metrics.total, 1) END
    ),
    'month', jsonb_build_object(
      'fromDate', v_month_start,
      'toDate', v_today,
      'total', month_metrics.total,
      'delivered', month_metrics.delivered,
      'failed', month_metrics.failed,
      'rescheduled', month_metrics.rescheduled,
      'pending', month_metrics.pending,
      'rate', CASE WHEN month_metrics.total = 0 THEN NULL ELSE ROUND(month_metrics.delivered * 100.0 / month_metrics.total, 1) END,
      'previousRate', CASE WHEN previous_month_metrics.total = 0 THEN NULL ELSE ROUND(previous_month_metrics.delivered * 100.0 / previous_month_metrics.total, 1) END
    ),
    'today', jsonb_build_object(
      'date', v_today,
      'total', today_metrics.total,
      'ready', today_metrics.ready,
      'assigned', today_metrics.assigned,
      'unassigned', today_metrics.unassigned,
      'rescheduledToday', today_metrics.rescheduled_today
    ),
    'attention', jsonb_build_object(
      'total', attention_metrics.total,
      'unassigned', attention_metrics.unassigned,
      'failed', attention_metrics.failed,
      'rescheduled', attention_metrics.rescheduled,
      'pending24h', attention_metrics.pending_24h,
      'paymentIssues', attention_metrics.payment_issues
    ),
    'runners', runner_json.value
  )
  INTO v_result
  FROM yesterday_metrics, month_metrics, previous_month_metrics, today_metrics, attention_metrics, outstanding_summary, runner_json;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_operations_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_operations_dashboard() TO authenticated;

COMMENT ON FUNCTION public.get_admin_operations_dashboard()
  IS 'Admin-only Operations Control Tower aggregate using canonical Asia/Brunei runner assignment cohorts and finance reconciliation state.';






