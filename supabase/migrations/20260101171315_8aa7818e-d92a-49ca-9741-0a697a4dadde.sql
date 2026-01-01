-- Add new movement types to enum
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'TRANSFER_IN';

-- Create manager_groups table
CREATE TABLE public.manager_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  manager_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(manager_user_id)
);

-- Create group_members table (salespersons under a manager)
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.manager_groups(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_user_id) -- A salesperson can only belong to one group
);

-- Create stock_visibility_overrides table (admin-controlled visibility)
CREATE TABLE public.stock_visibility_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(viewer_user_id, owner_user_id)
);

-- Create stock_transfers table for audit trail
CREATE TABLE public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_owner_id UUID NOT NULL REFERENCES public.profiles(id),
  to_owner_id UUID NOT NULL REFERENCES public.profiles(id),
  from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create stock_transfer_items table
CREATE TABLE public.stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.manager_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_visibility_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- RLS for manager_groups
CREATE POLICY "Admin can manage manager groups"
ON public.manager_groups FOR ALL
USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Managers can view their own group"
ON public.manager_groups FOR SELECT
USING (manager_user_id = auth.uid() OR get_user_role(auth.uid()) = 'admin');

-- RLS for group_members
CREATE POLICY "Admin can manage group members"
ON public.group_members FOR ALL
USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Managers can view their group members"
ON public.group_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.manager_groups mg
    WHERE mg.id = group_members.group_id
    AND mg.manager_user_id = auth.uid()
  )
  OR get_user_role(auth.uid()) = 'admin'
);

CREATE POLICY "Members can view their own membership"
ON public.group_members FOR SELECT
USING (member_user_id = auth.uid());

-- RLS for stock_visibility_overrides
CREATE POLICY "Admin can manage visibility overrides"
ON public.stock_visibility_overrides FOR ALL
USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can view overrides where they are viewer"
ON public.stock_visibility_overrides FOR SELECT
USING (viewer_user_id = auth.uid() OR get_user_role(auth.uid()) = 'admin');

-- RLS for stock_transfers
CREATE POLICY "Admin can manage stock transfers"
ON public.stock_transfers FOR ALL
USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can view transfers involving their stock"
ON public.stock_transfers FOR SELECT
USING (
  from_owner_id = auth.uid() 
  OR to_owner_id = auth.uid() 
  OR get_user_role(auth.uid()) IN ('admin', 'manager')
);

-- RLS for stock_transfer_items
CREATE POLICY "Admin can manage transfer items"
ON public.stock_transfer_items FOR ALL
USING (get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Users can view transfer items for visible transfers"
ON public.stock_transfer_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.stock_transfers st
    WHERE st.id = stock_transfer_items.transfer_id
    AND (
      st.from_owner_id = auth.uid() 
      OR st.to_owner_id = auth.uid() 
      OR get_user_role(auth.uid()) IN ('admin', 'manager')
    )
  )
);

-- Create function to check if user can view another user's stock
CREATE OR REPLACE FUNCTION public.can_view_stock(viewer_id UUID, owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Same user (owner viewing own stock)
    viewer_id = owner_id
    OR
    -- Admin can view all
    get_user_role(viewer_id) = 'admin'
    OR
    -- Manager can view members in their group
    (
      get_user_role(viewer_id) = 'manager'
      AND EXISTS (
        SELECT 1 FROM public.manager_groups mg
        JOIN public.group_members gm ON gm.group_id = mg.id
        WHERE mg.manager_user_id = viewer_id
        AND gm.member_user_id = owner_id
      )
    )
    OR
    -- Explicit visibility override granted
    EXISTS (
      SELECT 1 FROM public.stock_visibility_overrides svo
      WHERE svo.viewer_user_id = viewer_id
      AND svo.owner_user_id = owner_id
      AND svo.can_view = true
    )
$$;

-- Drop and recreate stock_balance_view with proper visibility
DROP VIEW IF EXISTS public.stock_balance_view;

CREATE VIEW public.stock_balance_view AS
SELECT 
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.owner_user_id,
  p_owner.display_name as owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  COALESCE(SUM(sm.qty_change), 0) as balance_qty,
  MAX(sm.created_at) as last_movement_time
FROM public.warehouses w
LEFT JOIN public.stock_movements sm ON sm.warehouse_id = w.id
LEFT JOIN public.products pr ON pr.id = sm.product_id
LEFT JOIN public.profiles p_owner ON p_owner.id = w.owner_user_id
WHERE w.is_active = true
  AND (sm.product_id IS NULL OR pr.is_active = true)
GROUP BY w.id, w.name, w.owner_user_id, p_owner.display_name, sm.product_id, pr.sku_code, pr.sku_name;

-- Add RLS-like filtering via security definer function for the view
-- Since views don't support RLS directly, we'll handle this in the application layer
-- using the can_view_stock function