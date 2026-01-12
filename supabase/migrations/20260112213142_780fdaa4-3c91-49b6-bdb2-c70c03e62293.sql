-- Create pc_owners table
CREATE TABLE IF NOT EXISTS public.pc_owners (
  owner_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create owner_access table
CREATE TABLE IF NOT EXISTS public.owner_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.pc_owners(owner_id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  can_operate BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, user_email)
);

-- Create cn_packages table
CREATE TABLE IF NOT EXISTS public.cn_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_no TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES public.pc_owners(owner_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'WAREHOUSE',
  batch_id UUID,
  intl_order_id UUID,
  latest_paid_at TIMESTAMPTZ,
  total_paid_cny NUMERIC(12, 2),
  weight_kg NUMERIC(8, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cn_package_skus table
CREATE TABLE IF NOT EXISTS public.cn_package_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.cn_packages(id) ON DELETE CASCADE,
  sku_code TEXT,
  sku_ref TEXT,
  product_title TEXT,
  qty NUMERIC(10, 2),
  unit_price_cny NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index on sku_code for search
CREATE INDEX IF NOT EXISTS idx_cn_package_skus_sku_code ON public.cn_package_skus(sku_code);
CREATE INDEX IF NOT EXISTS idx_cn_packages_tracking_no ON public.cn_packages(tracking_no);
CREATE INDEX IF NOT EXISTS idx_cn_packages_owner_id ON public.cn_packages(owner_id);
CREATE INDEX IF NOT EXISTS idx_cn_packages_status ON public.cn_packages(status);
CREATE INDEX IF NOT EXISTS idx_owner_access_user_email ON public.owner_access(user_email);

-- Create app_notifications table
CREATE TABLE IF NOT EXISTS public.app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_email ON public.app_notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_app_notifications_is_read ON public.app_notifications(is_read);

-- Enable RLS on all tables
ALTER TABLE public.pc_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cn_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cn_package_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pc_owners (viewable if user has access to that owner)
CREATE POLICY "Users can view owners they have access to"
ON public.pc_owners FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.owner_access oa
    WHERE oa.owner_id = pc_owners.owner_id
    AND oa.user_email = (auth.jwt() ->> 'email')
  )
  OR
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- RLS Policies for owner_access
CREATE POLICY "Users can view their own access"
ON public.owner_access FOR SELECT
USING (
  user_email = (auth.jwt() ->> 'email')
  OR
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

CREATE POLICY "Admins can manage owner_access"
ON public.owner_access FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- RLS Policies for cn_packages (only visible if user has owner_access)
CREATE POLICY "Users can view packages of owners they have access to"
ON public.cn_packages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.owner_access oa
    WHERE oa.owner_id = cn_packages.owner_id
    AND oa.user_email = (auth.jwt() ->> 'email')
  )
  OR
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- RLS Policies for cn_package_skus (only visible if linked package is visible)
CREATE POLICY "Users can view skus of packages they have access to"
ON public.cn_package_skus FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.cn_packages cp
    JOIN public.owner_access oa ON oa.owner_id = cp.owner_id
    WHERE cp.id = cn_package_skus.package_id
    AND oa.user_email = (auth.jwt() ->> 'email')
  )
  OR
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- RLS Policies for app_notifications (users can only see their own)
CREATE POLICY "Users can view their own notifications"
ON public.app_notifications FOR SELECT
USING (user_email = (auth.jwt() ->> 'email'));

CREATE POLICY "Users can update their own notifications"
ON public.app_notifications FOR UPDATE
USING (user_email = (auth.jwt() ->> 'email'));

-- Create view v_my_packages
CREATE OR REPLACE VIEW public.v_my_packages AS
SELECT 
  cp.id,
  cp.tracking_no,
  cp.owner_id,
  po.owner_name,
  cp.status,
  cp.batch_id,
  cp.intl_order_id,
  cp.latest_paid_at,
  cp.total_paid_cny,
  cp.weight_kg,
  cp.updated_at as last_updated_at,
  COALESCE(
    (SELECT array_agg(DISTINCT cps.sku_code) FILTER (WHERE cps.sku_code IS NOT NULL)
     FROM public.cn_package_skus cps 
     WHERE cps.package_id = cp.id),
    ARRAY[]::TEXT[]
  ) as sku_codes
FROM public.cn_packages cp
JOIN public.pc_owners po ON po.owner_id = cp.owner_id;

-- Create function for notification trigger
CREATE OR REPLACE FUNCTION public.notify_package_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
  owner_name_val TEXT;
BEGIN
  -- Only trigger on status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Get owner name
    SELECT owner_name INTO owner_name_val
    FROM public.pc_owners
    WHERE owner_id = NEW.owner_id;
    
    -- Insert notification for all users with access to this owner
    FOR user_record IN
      SELECT user_email FROM public.owner_access WHERE owner_id = NEW.owner_id
    LOOP
      INSERT INTO public.app_notifications (
        user_email,
        title,
        body,
        entity_type,
        entity_id
      ) VALUES (
        user_record.user_email,
        'Package Status Updated',
        'Package ' || NEW.tracking_no || ' status changed to ' || NEW.status,
        'package',
        NEW.id
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for status change notifications
DROP TRIGGER IF EXISTS trigger_package_status_change ON public.cn_packages;
CREATE TRIGGER trigger_package_status_change
AFTER UPDATE ON public.cn_packages
FOR EACH ROW
EXECUTE FUNCTION public.notify_package_status_change();

-- Create function to update updated_at on cn_packages
CREATE OR REPLACE FUNCTION public.update_cn_packages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cn_packages_updated_at ON public.cn_packages;
CREATE TRIGGER trigger_cn_packages_updated_at
BEFORE UPDATE ON public.cn_packages
FOR EACH ROW
EXECUTE FUNCTION public.update_cn_packages_updated_at();