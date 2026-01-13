
-- Add manager_id column to profiles table
-- This creates a hierarchy where salespeople can be assigned to a manager
ALTER TABLE public.profiles 
ADD COLUMN manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_profiles_manager_id ON public.profiles(manager_id) WHERE manager_id IS NOT NULL;

-- Create a function to get team member IDs for a manager
-- This is used in RLS policies to determine which users are under a manager
CREATE OR REPLACE FUNCTION public.get_team_member_ids(manager_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(id),
    ARRAY[]::uuid[]
  )
  FROM public.profiles
  WHERE manager_id = manager_user_id
$$;

-- Create a function to check if a user is in a manager's team
CREATE OR REPLACE FUNCTION public.is_in_manager_team(salesperson_user_id uuid, manager_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = salesperson_user_id
      AND manager_id = manager_user_id
  )
$$;

-- Add RLS policy for managers to view orders of their team members
CREATE POLICY "Manager can view team orders"
ON public.orders
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND (
    salesperson_id = auth.uid()  -- Manager's own orders
    OR is_in_manager_team(salesperson_id, auth.uid())  -- Team orders
  )
);

-- Add RLS policy for managers to update orders of their team members
CREATE POLICY "Manager can update team orders"
ON public.orders
FOR UPDATE
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND (
    salesperson_id = auth.uid()
    OR is_in_manager_team(salesperson_id, auth.uid())
  )
);

-- Add RLS policy for managers to view products of their team members
CREATE POLICY "Manager can view team products"
ON public.products
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND (
    owner_user_id = auth.uid()
    OR is_in_manager_team(owner_user_id, auth.uid())
  )
);

-- Add RLS policy for managers to view inbound shipments of their team members
CREATE POLICY "Manager can view team inbound shipments"
ON public.inbound_shipments
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND (
    salesperson_id = auth.uid()
    OR is_in_manager_team(salesperson_id, auth.uid())
  )
);

-- Add RLS policy for managers to view stock movements related to their team
CREATE POLICY "Manager can view team stock movements"
ON public.stock_movements
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
);

-- Add RLS policy for managers to view warehouses of their team members
CREATE POLICY "Manager can view team warehouses"
ON public.warehouses
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND (
    owner_user_id = auth.uid()
    OR is_in_manager_team(owner_user_id, auth.uid())
  )
);

-- Add RLS policy for managers to view order items of their team's orders
CREATE POLICY "Manager can view team order items"
ON public.order_items
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.salesperson_id = auth.uid()
      OR is_in_manager_team(o.salesperson_id, auth.uid())
    )
  )
);

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.manager_id IS 'Reference to the manager profile. Null means no manager assigned. Only admin can modify this field.';
