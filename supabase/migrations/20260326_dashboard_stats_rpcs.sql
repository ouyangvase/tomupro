-- Dashboard Stats RPCs
-- Consolidates 9-11 parallel COUNT queries per page load into single-scan RPCs.
-- Each RPC uses conditional aggregation (COUNT + FILTER/CASE) for one table scan.

-- ============================================================
-- 1. SALESPERSON DASHBOARD STATS
-- Replaces: useSalespersonStats (5 separate count queries)
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats_salesperson(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'bookingOrders', COUNT(*) FILTER (WHERE status = 'BOOKING'),
    'readyOrders', COUNT(*) FILTER (WHERE status = 'READY'),
    'pendingDelivery', COUNT(*) FILTER (
      WHERE status = 'READY'
      AND runner_status IN ('ASSIGNED', 'TAKEN', 'OUT_FOR_DELIVERY')
    ),
    'pendingReconciliation', COUNT(*) FILTER (
      WHERE runner_status = 'DELIVERED'
      AND reconciliation_status NOT IN ('CLAIMED', 'ADMIN_ACK_PENDING')
    ),
    'actionRequired', COUNT(*) FILTER (
      WHERE status != 'CANCELLED'
      AND (
        (salesperson_action_required = true AND runner_status != 'DELIVERED')
        OR (runner_status = 'FAILED_DELIVERY' AND status = 'READY')
      )
    ),
    'deliveredOrders', COUNT(*) FILTER (WHERE runner_status = 'DELIVERED'),
    'cancelledOrders', COUNT(*) FILTER (WHERE status = 'CANCELLED')
  ) INTO result
  FROM orders
  WHERE salesperson_id = p_user_id;

  RETURN result;
END;
$$;

-- ============================================================
-- 2. RUNNER DASHBOARD STATS
-- Replaces: useRunnerStats + useRunnerDashboardStats (8+ queries)
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats_runner(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  today_start TIMESTAMPTZ := date_trunc('day', now());
BEGIN
  SELECT json_build_object(
    'assignedToday', COUNT(*) FILTER (
      WHERE runner_status IN ('ASSIGNED', 'TAKEN')
    ),
    'deliveredToday', COUNT(*) FILTER (
      WHERE runner_status = 'DELIVERED'
      AND delivered_at >= today_start
    ),
    'failedToday', COUNT(*) FILTER (
      WHERE runner_status = 'FAILED_DELIVERY'
      AND updated_at >= today_start
    ),
    'totalDelivered', COUNT(*) FILTER (WHERE runner_status = 'DELIVERED'),
    'totalFailed', COUNT(*) FILTER (WHERE runner_status = 'FAILED_DELIVERY'),
    'pendingAssignment', COUNT(*) FILTER (
      WHERE status = 'READY'
      AND runner_status IN ('ASSIGNED', 'TAKEN')
    ),
    'inProgress', COUNT(*) FILTER (
      WHERE runner_status = 'OUT_FOR_DELIVERY'
    ),
    'pendingClaimCount', COUNT(*) FILTER (
      WHERE runner_status = 'DELIVERED'
      AND reconciliation_status = 'NOT_CLAIMED'
    ),
    'submittedClaimCount', COUNT(*) FILTER (
      WHERE reconciliation_status = 'ADMIN_ACK_PENDING'
    ),
    'failedOrdersCount', COUNT(*) FILTER (
      WHERE runner_status = 'FAILED_DELIVERY'
    ),
    'deliveredTodayValue', COALESCE(SUM(total_amount) FILTER (
      WHERE runner_status = 'DELIVERED'
      AND delivered_at >= today_start
    ), 0),
    'pendingClaimValue', COALESCE(SUM(total_amount) FILTER (
      WHERE runner_status = 'DELIVERED'
      AND reconciliation_status = 'NOT_CLAIMED'
    ), 0),
    'submittedClaimValue', COALESCE(SUM(total_amount) FILTER (
      WHERE reconciliation_status = 'ADMIN_ACK_PENDING'
    ), 0)
  ) INTO result
  FROM orders
  WHERE runner_id = p_user_id;

  RETURN result;
END;
$$;

-- ============================================================
-- 3. MANAGER DASHBOARD STATS
-- Replaces: useManagerStats (6+ queries across orders & products)
-- Takes array of visible team member IDs
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats_manager(p_team_ids UUID[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  products_count BIGINT;
BEGIN
  -- Get products count (separate table)
  SELECT COUNT(*) INTO products_count FROM products;

  SELECT json_build_object(
    'bookingOrders', COUNT(*) FILTER (WHERE status = 'BOOKING'),
    'readyOrders', COUNT(*) FILTER (WHERE status = 'READY'),
    'pendingDelivery', COUNT(*) FILTER (
      WHERE status = 'READY'
      AND runner_status IN ('ASSIGNED', 'TAKEN', 'OUT_FOR_DELIVERY')
    ),
    'pendingReconciliation', COUNT(*) FILTER (
      WHERE runner_status = 'DELIVERED'
      AND reconciliation_status NOT IN ('CLAIMED', 'ADMIN_ACK_PENDING')
    ),
    'deliveredOrders', COUNT(*) FILTER (WHERE runner_status = 'DELIVERED'),
    'cancelledOrders', COUNT(*) FILTER (WHERE status = 'CANCELLED'),
    'actionRequired', COUNT(*) FILTER (
      WHERE status != 'CANCELLED'
      AND (
        (salesperson_action_required = true AND runner_status != 'DELIVERED')
        OR (runner_status = 'FAILED_DELIVERY' AND status = 'READY')
      )
    ),
    'teamRealizedGmv', COALESCE(SUM(total_amount) FILTER (WHERE runner_status = 'DELIVERED'), 0),
    'teamPipelineGmv', COALESCE(SUM(total_amount) FILTER (WHERE status IN ('BOOKING', 'READY')), 0),
    'productsCount', products_count
  ) INTO result
  FROM orders
  WHERE salesperson_id = ANY(p_team_ids);

  RETURN result;
END;
$$;

-- ============================================================
-- 4. ADMIN DASHBOARD STATS
-- Replaces: useAdminStats (9 separate count queries across 5 tables)
-- ============================================================
CREATE OR REPLACE FUNCTION get_dashboard_stats_admin()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  order_stats JSON;
  products_count BIGINT;
  claims_count BIGINT;
  inbound_count BIGINT;
  users_count BIGINT;
BEGIN
  -- Orders (single scan)
  SELECT json_build_object(
    'bookingOrders', COUNT(*) FILTER (WHERE status = 'BOOKING'),
    'readyOrders', COUNT(*) FILTER (WHERE status = 'READY'),
    'cancelledOrders', COUNT(*) FILTER (WHERE status = 'CANCELLED'),
    'pendingDelivery', COUNT(*) FILTER (
      WHERE status = 'READY'
      AND runner_status IN ('ASSIGNED', 'TAKEN', 'OUT_FOR_DELIVERY')
    ),
    'deliveredOrders', COUNT(*) FILTER (WHERE runner_status = 'DELIVERED'),
    'actionRequired', COUNT(*) FILTER (
      WHERE status != 'CANCELLED'
      AND (
        (salesperson_action_required = true AND runner_status != 'DELIVERED')
        OR (runner_status = 'FAILED_DELIVERY' AND status = 'READY')
      )
    ),
    'pendingClaimBatches', (SELECT COUNT(*) FROM claim_batches WHERE status = 'ADMIN_ACK_PENDING')
  ) INTO order_stats
  FROM orders;

  SELECT COUNT(*) INTO products_count FROM products;
  SELECT COUNT(*) INTO claims_count FROM claims;
  SELECT COUNT(*) INTO inbound_count FROM inbound_shipments;
  SELECT COUNT(*) INTO users_count FROM profiles WHERE is_active = true;

  result := json_build_object(
    'bookingOrders', (order_stats->>'bookingOrders')::int,
    'readyOrders', (order_stats->>'readyOrders')::int,
    'cancelledOrders', (order_stats->>'cancelledOrders')::int,
    'pendingDelivery', (order_stats->>'pendingDelivery')::int,
    'deliveredOrders', (order_stats->>'deliveredOrders')::int,
    'actionRequired', (order_stats->>'actionRequired')::int,
    'pendingClaimBatches', (order_stats->>'pendingClaimBatches')::int,
    'productsCount', products_count,
    'totalClaims', claims_count,
    'totalInbounds', inbound_count,
    'totalUsers', users_count
  );

  RETURN result;
END;
$$;

-- ============================================================
-- 5. SIDEBAR BADGE STATS
-- Replaces: useSidebarBadges (3 separate queries)
-- ============================================================
CREATE OR REPLACE FUNCTION get_sidebar_badges(p_user_id UUID, p_role TEXT, p_visible_ids UUID[] DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action_count BIGINT := 0;
  claim_batch_count BIGINT := 0;
  runner_inbox_count BIGINT := 0;
BEGIN
  -- Action count (role-dependent)
  -- Tightened: FAILED_DELIVERY only for READY orders; salesperson_action_required excludes DELIVERED
  IF p_role = 'admin' THEN
    SELECT COUNT(*) INTO action_count
    FROM orders
    WHERE status != 'CANCELLED'
    AND (
      (salesperson_action_required = true AND runner_status != 'DELIVERED')
      OR (runner_status = 'FAILED_DELIVERY' AND status = 'READY')
    );
  ELSIF p_role = 'salesperson' THEN
    SELECT COUNT(*) INTO action_count
    FROM orders
    WHERE salesperson_id = p_user_id
    AND status != 'CANCELLED'
    AND (
      (salesperson_action_required = true AND runner_status != 'DELIVERED')
      OR (runner_status = 'FAILED_DELIVERY' AND status = 'READY')
    );
  ELSIF p_role = 'runner' THEN
    SELECT COUNT(*) INTO action_count
    FROM orders
    WHERE runner_id = p_user_id
    AND runner_status = 'FAILED_DELIVERY'
    AND status = 'READY';
  ELSIF p_role = 'manager' AND p_visible_ids IS NOT NULL THEN
    SELECT COUNT(*) INTO action_count
    FROM orders
    WHERE salesperson_id = ANY(p_visible_ids)
    AND status != 'CANCELLED'
    AND (
      (salesperson_action_required = true AND runner_status != 'DELIVERED')
      OR (runner_status = 'FAILED_DELIVERY' AND status = 'READY')
    );
  END IF;

  -- Claim batch count (admin only)
  IF p_role = 'admin' THEN
    SELECT COUNT(*) INTO claim_batch_count
    FROM claim_batches
    WHERE status = 'ADMIN_ACK_PENDING';
  END IF;

  -- Runner inbox count (runner only)
  IF p_role = 'runner' THEN
    SELECT COUNT(*) INTO runner_inbox_count
    FROM orders
    WHERE runner_id = p_user_id
    AND status = 'READY'
    AND runner_status IN ('ASSIGNED', 'TAKEN');
  END IF;

  RETURN json_build_object(
    'actionCount', action_count,
    'claimBatchCount', claim_batch_count,
    'runnerInboxCount', runner_inbox_count
  );
END;
$$;

-- ============================================================
-- 6. DELIVERED SKU SUMMARY
-- Server-side aggregation of delivered quantities by SKU code.
-- Replaces client-side iteration over all delivered orders.
-- ============================================================
CREATE OR REPLACE FUNCTION get_delivered_sku_summary(
  p_runner_id UUID DEFAULT NULL,
  p_salesperson_ids UUID[] DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT
      UPPER(COALESCE(p.sku_code, oi.sku_label, 'UNKNOWN')) AS sku_code,
      COALESCE(p.sku_name, oi.sku_label, 'Unknown') AS sku_name,
      SUM(oi.qty) AS total_qty,
      COUNT(DISTINCT o.id) AS total_orders,
      SUM(oi.price) AS total_amount
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.runner_status = 'DELIVERED'
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
      AND (p_date_from IS NULL OR o.delivered_at::date >= p_date_from)
      AND (p_date_to IS NULL OR o.delivered_at::date <= p_date_to)
    GROUP BY UPPER(COALESCE(p.sku_code, oi.sku_label, 'UNKNOWN')),
             COALESCE(p.sku_name, oi.sku_label, 'Unknown')
    ORDER BY total_qty DESC
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;
