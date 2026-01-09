-- Create leaderboard settings table for admin configuration
CREATE TABLE public.leaderboard_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_mode TEXT NOT NULL DEFAULT 'month', -- 'today', 'week', 'month', 'custom'
  primary_metric TEXT NOT NULL DEFAULT 'net_sales', -- 'completed_orders', 'net_sales', 'delivered_orders', 'conversion_score', 'success_rate'
  tie_breakers TEXT[] NOT NULL DEFAULT ARRAY['net_sales', 'completed_orders', 'failed_count']::TEXT[],
  visibility_mode TEXT NOT NULL DEFAULT 'all', -- 'all', 'top_10_self', 'self_only'
  included_salesperson_ids UUID[] DEFAULT NULL, -- NULL means include all
  excluded_salesperson_ids UUID[] DEFAULT ARRAY[]::UUID[],
  enabled_metrics TEXT[] NOT NULL DEFAULT ARRAY['completed_orders', 'net_sales', 'delivered_orders']::TEXT[],
  filters_default JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

-- Create leaderboard archive table for monthly snapshots
CREATE TABLE public.leaderboard_archive (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metric_config_snapshot JSONB NOT NULL,
  ranks JSONB NOT NULL, -- Array of { salesperson_id, rank, metrics: { ... } }
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint for period
CREATE UNIQUE INDEX leaderboard_archive_period_idx ON public.leaderboard_archive(period_start, period_end);

-- Create leaderboard participant overrides (for individual salesperson visibility)
CREATE TABLE public.leaderboard_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salesperson_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_included BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id),
  UNIQUE(salesperson_id)
);

-- Enable RLS
ALTER TABLE public.leaderboard_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leaderboard_settings
CREATE POLICY "Admin can manage leaderboard settings"
ON public.leaderboard_settings
FOR ALL
USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Anyone can view leaderboard settings"
ON public.leaderboard_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for leaderboard_archive
CREATE POLICY "Admin can manage leaderboard archive"
ON public.leaderboard_archive
FOR ALL
USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Anyone can view leaderboard archive"
ON public.leaderboard_archive
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for leaderboard_participants
CREATE POLICY "Admin can manage leaderboard participants"
ON public.leaderboard_participants
FOR ALL
USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Users can view leaderboard participants"
ON public.leaderboard_participants
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Insert default settings
INSERT INTO public.leaderboard_settings (period_mode, primary_metric, visibility_mode)
VALUES ('month', 'net_sales', 'all');

-- Create function to get leaderboard rankings
CREATE OR REPLACE FUNCTION public.get_leaderboard_rankings(
  p_period_start DATE,
  p_period_end DATE,
  p_primary_metric TEXT DEFAULT 'net_sales'
)
RETURNS TABLE (
  salesperson_id UUID,
  salesperson_name TEXT,
  completed_orders BIGINT,
  net_sales NUMERIC,
  delivered_orders BIGINT,
  failed_orders BIGINT,
  conversion_score NUMERIC,
  success_rate NUMERIC,
  rank_position BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH order_metrics AS (
    SELECT 
      o.salesperson_id,
      COUNT(CASE WHEN o.reconciliation_status = 'SETTLED' THEN 1 END) AS completed_orders,
      COALESCE(SUM(CASE WHEN o.reconciliation_status = 'SETTLED' 
        THEN o.total_amount - COALESCE(o.discount_amount, 0) END), 0) AS net_sales,
      COUNT(CASE WHEN o.runner_status = 'DELIVERED' THEN 1 END) AS delivered_orders,
      COUNT(CASE WHEN o.runner_status = 'FAILED' OR o.driver_status = 'FAILED' THEN 1 END) AS failed_orders
    FROM orders o
    WHERE o.order_date >= p_period_start
      AND o.order_date <= p_period_end
    GROUP BY o.salesperson_id
  ),
  ranked AS (
    SELECT 
      p.id AS salesperson_id,
      p.display_name AS salesperson_name,
      COALESCE(om.completed_orders, 0) AS completed_orders,
      COALESCE(om.net_sales, 0) AS net_sales,
      COALESCE(om.delivered_orders, 0) AS delivered_orders,
      COALESCE(om.failed_orders, 0) AS failed_orders,
      CASE 
        WHEN COALESCE(om.delivered_orders, 0) > 0 
        THEN ROUND((COALESCE(om.completed_orders, 0)::NUMERIC / om.delivered_orders) * 100, 2)
        ELSE 0 
      END AS conversion_score,
      CASE 
        WHEN (COALESCE(om.delivered_orders, 0) + COALESCE(om.failed_orders, 0)) > 0 
        THEN ROUND((COALESCE(om.delivered_orders, 0)::NUMERIC / (om.delivered_orders + om.failed_orders)) * 100, 2)
        ELSE 0 
      END AS success_rate
    FROM profiles p
    LEFT JOIN order_metrics om ON p.id = om.salesperson_id
    WHERE p.role = 'salesperson' AND p.is_active = true
  )
  SELECT 
    r.salesperson_id,
    r.salesperson_name,
    r.completed_orders,
    r.net_sales,
    r.delivered_orders,
    r.failed_orders,
    r.conversion_score,
    r.success_rate,
    ROW_NUMBER() OVER (
      ORDER BY 
        CASE p_primary_metric
          WHEN 'net_sales' THEN r.net_sales
          WHEN 'completed_orders' THEN r.completed_orders::NUMERIC
          WHEN 'delivered_orders' THEN r.delivered_orders::NUMERIC
          WHEN 'conversion_score' THEN r.conversion_score
          WHEN 'success_rate' THEN r.success_rate
          ELSE r.net_sales
        END DESC,
        r.net_sales DESC,
        r.completed_orders DESC,
        r.failed_orders ASC
    ) AS rank_position
  FROM ranked r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;