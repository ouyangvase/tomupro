-- 1) pc_packages_mirror
CREATE TABLE public.pc_packages_mirror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pc_package_id uuid UNIQUE NOT NULL,
  tracking_no_cn text NOT NULL,
  owner_id uuid NOT NULL,
  owner_name text,
  status text NOT NULL DEFAULT 'WAREHOUSE',
  destination text,
  total_paid_cny numeric,
  log_cost_rm numeric,
  weight_kg numeric,
  updated_at timestamptz DEFAULT now(),
  arrived_destination_at timestamptz
);

-- 2) pc_package_lines_mirror
CREATE TABLE public.pc_package_lines_mirror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pc_package_id uuid NOT NULL REFERENCES public.pc_packages_mirror(pc_package_id) ON DELETE CASCADE,
  sku_code text,
  sku_ref text,
  product_title text,
  qty integer,
  unit_price_cny numeric,
  updated_at timestamptz DEFAULT now()
);

-- 3) pc_owner_access_mirror
CREATE TABLE public.pc_owner_access_mirror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  owner_id uuid NOT NULL,
  can_operate boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_email, owner_id)
);

-- 4) pc_notifications
CREATE TABLE public.pc_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  title text NOT NULL,
  body text,
  pc_package_id uuid REFERENCES public.pc_packages_mirror(pc_package_id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  read_at timestamptz
);

-- Indexes
CREATE INDEX idx_pc_packages_mirror_owner ON public.pc_packages_mirror(owner_id);
CREATE INDEX idx_pc_packages_mirror_status ON public.pc_packages_mirror(status);
CREATE INDEX idx_pc_package_lines_mirror_package ON public.pc_package_lines_mirror(pc_package_id);
CREATE INDEX idx_pc_package_lines_mirror_sku ON public.pc_package_lines_mirror(sku_code);
CREATE INDEX idx_pc_owner_access_mirror_email ON public.pc_owner_access_mirror(user_email);
CREATE INDEX idx_pc_notifications_email ON public.pc_notifications(user_email);

-- Enable RLS
ALTER TABLE public.pc_packages_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_package_lines_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_owner_access_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_notifications ENABLE ROW LEVEL SECURITY;

-- RLS: pc_packages_mirror - users can view packages of owners they have access to
CREATE POLICY "Users can view accessible packages"
ON public.pc_packages_mirror FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pc_owner_access_mirror a
    WHERE a.user_email = (auth.jwt() ->> 'email')
      AND a.owner_id = pc_packages_mirror.owner_id
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- RLS: pc_package_lines_mirror - follow parent package access
CREATE POLICY "Users can view package lines for accessible packages"
ON public.pc_package_lines_mirror FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pc_packages_mirror pkg
    JOIN public.pc_owner_access_mirror a ON a.owner_id = pkg.owner_id
    WHERE pkg.pc_package_id = pc_package_lines_mirror.pc_package_id
      AND a.user_email = (auth.jwt() ->> 'email')
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- RLS: pc_owner_access_mirror - users see their own access
CREATE POLICY "Users can view their own access"
ON public.pc_owner_access_mirror FOR SELECT
USING (
  user_email = (auth.jwt() ->> 'email')
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- RLS: pc_notifications - users can view/update their own
CREATE POLICY "Users can view their notifications"
ON public.pc_notifications FOR SELECT
USING (user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their notifications"
ON public.pc_notifications FOR UPDATE
USING (user_email = (auth.jwt() ->> 'email'));

-- Admin can manage all mirror tables
CREATE POLICY "Admin can manage packages mirror"
ON public.pc_packages_mirror FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admin can manage package lines mirror"
ON public.pc_package_lines_mirror FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admin can manage owner access mirror"
ON public.pc_owner_access_mirror FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admin can manage notifications"
ON public.pc_notifications FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));