-- =============================================
-- STEP 1: CREATE CORE TABLES
-- =============================================

-- 1) CREATE manager_salesperson_bindings table with UNIQUE salesperson constraint
CREATE TABLE IF NOT EXISTS public.manager_salesperson_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES public.profiles(id),
  salesperson_id UUID NOT NULL REFERENCES public.profiles(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NULL,
  created_by UUID REFERENCES public.profiles(id)
);

-- Create unique constraint on salesperson_id to enforce single ownership
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_salesperson_binding 
ON public.manager_salesperson_bindings(salesperson_id) 
WHERE active = true;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_msb_manager ON public.manager_salesperson_bindings(manager_id) WHERE active = true;

-- Enable RLS
ALTER TABLE public.manager_salesperson_bindings ENABLE ROW LEVEL SECURITY;

-- RLS policies for manager_salesperson_bindings
CREATE POLICY "Admin can manage all manager_salesperson_bindings"
  ON public.manager_salesperson_bindings FOR ALL
  USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Managers can view their own msb"
  ON public.manager_salesperson_bindings FOR SELECT
  USING (manager_id = auth.uid());

CREATE POLICY "Salespersons can view their own msb"
  ON public.manager_salesperson_bindings FOR SELECT
  USING (salesperson_id = auth.uid());

-- 2) Add manager snapshot columns to orders table
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS owner_manager_id_snapshot UUID,
  ADD COLUMN IF NOT EXISTS owner_salesperson_id_snapshot UUID,
  ADD COLUMN IF NOT EXISTS owner_salesperson_display_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS owner_manager_display_name_snapshot TEXT;

-- Create index for manager-based queries
CREATE INDEX IF NOT EXISTS idx_orders_owner_manager_snapshot ON public.orders(owner_manager_id_snapshot);

-- 3) CREATE manager_kpi_daily table for Leadership Score tracking
CREATE TABLE IF NOT EXISTS public.manager_kpi_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES public.profiles(id),
  kpi_date DATE NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'daily',
  
  -- Team metrics
  team_realized_gmv_bnd NUMERIC DEFAULT 0,
  team_pipeline_gmv_bnd NUMERIC DEFAULT 0,
  team_delivered_orders INTEGER DEFAULT 0,
  team_booking_orders INTEGER DEFAULT 0,
  team_ready_orders INTEGER DEFAULT 0,
  team_total_orders INTEGER DEFAULT 0,
  team_action_required_count INTEGER DEFAULT 0,
  
  -- Team health metrics
  team_active_salespersons INTEGER DEFAULT 0,
  team_members_with_orders INTEGER DEFAULT 0,
  dependency_ratio NUMERIC DEFAULT 0,
  top_bottom_gap_ratio NUMERIC DEFAULT 0,
  bottom30_improve_pct NUMERIC DEFAULT 0,
  
  -- Manager ops metrics
  inbound_ack_count INTEGER DEFAULT 0,
  orders_rescued_count INTEGER DEFAULT 0,
  dispute_resolved_count INTEGER DEFAULT 0,
  runner_reassigned_count INTEGER DEFAULT 0,
  
  -- Personal performance
  personal_realized_gmv_bnd NUMERIC DEFAULT 0,
  personal_pipeline_gmv_bnd NUMERIC DEFAULT 0,
  personal_delivered_orders INTEGER DEFAULT 0,
  
  -- Leadership score
  leadership_score NUMERIC DEFAULT 0,
  score_breakdown_json JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_manager_kpi_date UNIQUE (manager_id, kpi_date)
);

-- Enable RLS
ALTER TABLE public.manager_kpi_daily ENABLE ROW LEVEL SECURITY;

-- RLS policies for manager_kpi_daily
CREATE POLICY "Managers can view their own KPIs"
  ON public.manager_kpi_daily FOR SELECT
  USING (manager_id = auth.uid() OR get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Admin can manage all KPIs"
  ON public.manager_kpi_daily FOR ALL
  USING (get_user_role(auth.uid()) = 'admin'::app_role);