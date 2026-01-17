
-- Fix is_in_manager_team function with CASCADE and recreate all dependent policies

-- Drop the function with cascade (removes dependent policies)
DROP FUNCTION IF EXISTS public.is_in_manager_team(uuid, uuid) CASCADE;

-- Create the fixed function with proper parameter names to avoid column conflicts
CREATE FUNCTION public.is_in_manager_team(p_salesperson_id uuid, p_manager_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    -- Primary: manager_salesperson_bindings
    SELECT 1
    FROM public.manager_salesperson_bindings msb
    WHERE msb.manager_id = p_manager_id
      AND msb.salesperson_id = p_salesperson_id
      AND msb.active = true
  )
  OR EXISTS (
    -- Fallback: manager_groups + group_members
    SELECT 1
    FROM public.group_members gm
    JOIN public.manager_groups mg ON mg.id = gm.group_id
    WHERE mg.manager_user_id = p_manager_id
      AND gm.member_user_id = p_salesperson_id
  );
END;
$$;

-- Recreate all the RLS policies that were dropped with CASCADE

-- 1. Orders - Manager view
CREATE POLICY "Manager can view team orders including inactive"
ON public.orders
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'
  AND (
    created_by_user_id = auth.uid()
    OR salesperson_id = auth.uid()
    OR is_in_manager_team(salesperson_id, auth.uid())
    OR is_in_manager_team(created_by_user_id, auth.uid())
  )
);

-- 2. Orders - Manager update
CREATE POLICY "Manager can update team orders"
ON public.orders
FOR UPDATE
USING (
  get_user_role(auth.uid()) = 'manager'
  AND (
    salesperson_id = auth.uid()
    OR is_in_manager_team(salesperson_id, auth.uid())
  )
);

-- 3. Products - Manager view
CREATE POLICY "Manager can view team products"
ON public.products
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'
  AND (
    created_by = auth.uid()
    OR is_in_manager_team(created_by, auth.uid())
  )
);

-- 4. Products - Manager create
CREATE POLICY "Manager can create products for team members"
ON public.products
FOR INSERT
WITH CHECK (
  get_user_role(auth.uid()) = 'manager'
  AND (
    created_by = auth.uid()
    OR is_in_manager_team(created_by, auth.uid())
  )
);

-- 5. Products - Manager update
CREATE POLICY "Manager can update team products"
ON public.products
FOR UPDATE
USING (
  get_user_role(auth.uid()) = 'manager'
  AND (
    created_by = auth.uid()
    OR is_in_manager_team(created_by, auth.uid())
  )
);

-- 6. Warehouses - Manager view
CREATE POLICY "Manager can view team warehouses"
ON public.warehouses
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'manager'
  AND (
    owner_user_id = auth.uid()
    OR is_in_manager_team(owner_user_id, auth.uid())
  )
);

-- 7. Order items - Manager view
CREATE POLICY "Manager can view team order items"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND get_user_role(auth.uid()) = 'manager'
    AND (
      o.salesperson_id = auth.uid()
      OR is_in_manager_team(o.salesperson_id, auth.uid())
    )
  )
);

-- 8. Inbound shipments - Manager view
CREATE POLICY "Inbound shipments scoped visibility"
ON public.inbound_shipments
FOR SELECT
USING (
  get_user_role(auth.uid()) = 'admin'
  OR salesperson_id = auth.uid()
  OR runner_id = auth.uid()
  OR (
    get_user_role(auth.uid()) = 'manager'
    AND (
      salesperson_id = auth.uid()
      OR is_in_manager_team(salesperson_id, auth.uid())
    )
  )
);
