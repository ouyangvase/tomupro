-- Commission settings per salesperson
CREATE TABLE public.commission_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salesperson_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  commission_mode TEXT NOT NULL CHECK (commission_mode IN ('PER_ORDER', 'PERCENTAGE')),
  base_value NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_tiered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id),
  CONSTRAINT unique_salesperson_commission UNIQUE (salesperson_id)
);

-- Commission tiers for tiered commission structure
CREATE TABLE public.commission_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settings_id UUID NOT NULL REFERENCES public.commission_settings(id) ON DELETE CASCADE,
  tier_order INTEGER NOT NULL DEFAULT 1,
  min_orders INTEGER NOT NULL DEFAULT 0,
  max_orders INTEGER,
  tier_value NUMERIC(10,4) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_tier_order UNIQUE (settings_id, tier_order)
);

-- Monthly targets per salesperson
CREATE TABLE public.salesperson_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  salesperson_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('ORDER_COUNT', 'SALES_VALUE')),
  target_value NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id),
  CONSTRAINT unique_monthly_target UNIQUE (salesperson_id, year_month)
);

-- Immutable commission snapshots per order (created on reconciliation approval)
CREATE TABLE public.commission_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  salesperson_id UUID NOT NULL REFERENCES public.profiles(id),
  commission_mode TEXT NOT NULL,
  commission_value NUMERIC(10,4) NOT NULL,
  commission_base_amount NUMERIC(12,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  tier_applied INTEGER,
  year_month TEXT NOT NULL,
  order_sequence_in_month INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reconciled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_order_commission UNIQUE (order_id)
);

-- Enable RLS
ALTER TABLE public.commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_snapshots ENABLE ROW LEVEL SECURITY;

-- Commission settings policies (admin only for write, salesperson can view own)
CREATE POLICY "Admins can manage commission settings"
ON public.commission_settings
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

CREATE POLICY "Salespersons can view own commission settings"
ON public.commission_settings
FOR SELECT
USING (salesperson_id = auth.uid());

-- Commission tiers policies
CREATE POLICY "Admins can manage commission tiers"
ON public.commission_tiers
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

CREATE POLICY "Salespersons can view own commission tiers"
ON public.commission_tiers
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.commission_settings cs
    WHERE cs.id = settings_id AND cs.salesperson_id = auth.uid()
  )
);

-- Salesperson targets policies
CREATE POLICY "Admins can manage salesperson targets"
ON public.salesperson_targets
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

CREATE POLICY "Salespersons can view own targets"
ON public.salesperson_targets
FOR SELECT
USING (salesperson_id = auth.uid());

-- Commission snapshots policies (read-only after creation)
CREATE POLICY "Admins can view all commission snapshots"
ON public.commission_snapshots
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

CREATE POLICY "Salespersons can view own commission snapshots"
ON public.commission_snapshots
FOR SELECT
USING (salesperson_id = auth.uid());

CREATE POLICY "System can insert commission snapshots"
ON public.commission_snapshots
FOR INSERT
WITH CHECK (true);

-- Add discount column to orders if not exists
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;

-- Create indexes for performance
CREATE INDEX idx_commission_settings_salesperson ON public.commission_settings(salesperson_id);
CREATE INDEX idx_commission_tiers_settings ON public.commission_tiers(settings_id);
CREATE INDEX idx_salesperson_targets_lookup ON public.salesperson_targets(salesperson_id, year_month);
CREATE INDEX idx_commission_snapshots_salesperson ON public.commission_snapshots(salesperson_id);
CREATE INDEX idx_commission_snapshots_month ON public.commission_snapshots(salesperson_id, year_month);

-- Trigger to update updated_at
CREATE TRIGGER update_commission_settings_updated_at
BEFORE UPDATE ON public.commission_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_salesperson_targets_updated_at
BEFORE UPDATE ON public.salesperson_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();