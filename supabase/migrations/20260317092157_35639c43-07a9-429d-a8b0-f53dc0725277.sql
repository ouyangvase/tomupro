
CREATE OR REPLACE FUNCTION get_runner_earnings_summary(p_runner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_today_start timestamptz;
  v_week_start timestamptz;
  v_month_start timestamptz;
BEGIN
  v_today_start := date_trunc('day', now());
  v_week_start := date_trunc('week', now());
  v_month_start := date_trunc('month', now());

  WITH order_earnings AS (
    SELECT 
      o.id,
      o.delivered_at,
      o.reconciliation_status,
      o.total_amount,
      COALESCE(dc.charge_amount, 0) as delivery_fee
    FROM orders o
    LEFT JOIN delivery_charges dc ON dc.runner_id = o.runner_id 
      AND lower(dc.area) = lower(o.area) 
      AND dc.status = 'APPROVED'
      AND dc.superseded_at IS NULL
    WHERE o.runner_id = p_runner_id
      AND o.runner_status = 'DELIVERED'
      AND o.status != 'CANCELLED'
  )
  SELECT jsonb_build_object(
    'today_earnings', COALESCE(SUM(CASE WHEN delivered_at >= v_today_start THEN delivery_fee END), 0),
    'today_orders', COALESCE(COUNT(CASE WHEN delivered_at >= v_today_start THEN 1 END), 0),
    'week_earnings', COALESCE(SUM(CASE WHEN delivered_at >= v_week_start THEN delivery_fee END), 0),
    'week_orders', COALESCE(COUNT(CASE WHEN delivered_at >= v_week_start THEN 1 END), 0),
    'month_earnings', COALESCE(SUM(CASE WHEN delivered_at >= v_month_start THEN delivery_fee END), 0),
    'month_orders', COALESCE(COUNT(CASE WHEN delivered_at >= v_month_start THEN 1 END), 0),
    'pending_amount', COALESCE(SUM(CASE WHEN reconciliation_status = 'NOT_CLAIMED' THEN delivery_fee END), 0),
    'pending_orders', COALESCE(COUNT(CASE WHEN reconciliation_status = 'NOT_CLAIMED' THEN 1 END), 0),
    'approved_amount', COALESCE(SUM(CASE WHEN reconciliation_status IN ('CLAIMED', 'SETTLED') THEN delivery_fee END), 0),
    'approved_orders', COALESCE(COUNT(CASE WHEN reconciliation_status IN ('CLAIMED', 'SETTLED') THEN 1 END), 0),
    'submitted_amount', COALESCE(SUM(CASE WHEN reconciliation_status IN ('ADMIN_ACK_PENDING', 'SP_ACK_PENDING') THEN delivery_fee END), 0),
    'submitted_orders', COALESCE(COUNT(CASE WHEN reconciliation_status IN ('ADMIN_ACK_PENDING', 'SP_ACK_PENDING') THEN 1 END), 0),
    'total_lifetime_earnings', COALESCE(SUM(delivery_fee), 0),
    'total_lifetime_orders', COALESCE(COUNT(*), 0)
  ) INTO v_result
  FROM order_earnings;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION get_runner_daily_earnings(
  p_runner_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE(day date, earnings numeric, order_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      (current_date - (p_days - 1) * interval '1 day')::date,
      current_date,
      '1 day'::interval
    )::date AS day
  ),
  daily AS (
    SELECT 
      (o.delivered_at AT TIME ZONE 'UTC')::date AS delivery_day,
      COALESCE(SUM(dc.charge_amount), 0) as total_earnings,
      COUNT(*) as cnt
    FROM orders o
    LEFT JOIN delivery_charges dc ON dc.runner_id = o.runner_id 
      AND lower(dc.area) = lower(o.area) 
      AND dc.status = 'APPROVED'
      AND dc.superseded_at IS NULL
    WHERE o.runner_id = p_runner_id
      AND o.runner_status = 'DELIVERED'
      AND o.status != 'CANCELLED'
      AND o.delivered_at >= (current_date - (p_days - 1) * interval '1 day')
    GROUP BY delivery_day
  )
  SELECT 
    ds.day,
    COALESCE(d.total_earnings, 0)::numeric as earnings,
    COALESCE(d.cnt, 0)::bigint as order_count
  FROM date_series ds
  LEFT JOIN daily d ON d.delivery_day = ds.day
  ORDER BY ds.day;
END;
$$;
