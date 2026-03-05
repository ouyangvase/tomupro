-- ============================================================================
-- Migration: Leaderboard - Switch to delivered_at as sole date dimension
-- ============================================================================
-- This replaces the existing get_leaderboard_rankings function to use
-- delivered_at instead of order_date for ALL leaderboard calculations.
-- Only orders with runner_status = 'DELIVERED' AND delivered_at IS NOT NULL
-- are counted.
-- ============================================================================

-- Drop old function signatures
DROP FUNCTION IF EXISTS public.get_leaderboard_rankings(date, date);
DROP FUNCTION IF EXISTS public.get_leaderboard_rankings(date, date, text);

-- Create new function using delivered_at
CREATE OR REPLACE FUNCTION public.get_leaderboard_rankings(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  salesperson_id uuid,
  salesperson_name text,
  avatar_url text,
  delivered_orders bigint,
  failed_orders bigint,
  net_sales numeric,
  completed_orders bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH order_metrics AS (
    SELECT
      o.salesperson_id,
      COUNT(*) FILTER (WHERE o.runner_status = 'DELIVERED') as delivered_count,
      COUNT(*) FILTER (WHERE o.runner_status = 'FAILED_DELIVERY') as failed_count,
      COALESCE(SUM(
        CASE WHEN o.runner_status = 'DELIVERED'
        THEN (o.total_amount - COALESCE(o.discount_amount, 0))
        ELSE 0 END
      ), 0) as total_net_sales,
      COUNT(*) FILTER (WHERE o.reconciliation_status = 'SETTLED') as completed_count
    FROM orders o
    WHERE o.delivered_at IS NOT NULL
      AND o.delivered_at::date >= p_start_date
      AND o.delivered_at::date <= p_end_date
      AND o.status != 'CANCELLED'
    GROUP BY o.salesperson_id
  ),
  active_salespeople AS (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url
    FROM profiles p
    LEFT JOIN leaderboard_participants lp ON lp.salesperson_id = p.id
    WHERE p.role = 'salesperson'
      AND p.is_active = true
      AND (lp.is_included IS NULL OR lp.is_included = true)
  )
  SELECT
    asp.id as salesperson_id,
    asp.display_name as salesperson_name,
    asp.avatar_url,
    COALESCE(om.delivered_count, 0)::bigint as delivered_orders,
    COALESCE(om.failed_count, 0)::bigint as failed_orders,
    COALESCE(om.total_net_sales, 0)::numeric as net_sales,
    COALESCE(om.completed_count, 0)::bigint as completed_orders
  FROM active_salespeople asp
  LEFT JOIN order_metrics om ON om.salesperson_id = asp.id
  ORDER BY
    COALESCE(om.total_net_sales, 0) DESC,
    COALESCE(om.delivered_count, 0) DESC,
    COALESCE(om.failed_count, 0) ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_leaderboard_rankings(date, date) TO authenticated;

-- ============================================================================
-- Performance indexes for delivered_at based queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at
  ON public.orders (delivered_at)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_salesperson_delivered_at
  ON public.orders (salesperson_id, delivered_at)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_delivered_at
  ON public.orders (status, delivered_at)
  WHERE delivered_at IS NOT NULL;
