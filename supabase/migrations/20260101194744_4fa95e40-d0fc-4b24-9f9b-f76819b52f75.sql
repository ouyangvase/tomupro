-- Fix 1: Restrict manager access to profiles - only see group members' profiles
-- Drop and recreate the policy for admin/manager profile access
DROP POLICY IF EXISTS "Admin and Manager can read all profiles" ON public.profiles;

-- Create new policy: Admin can read ALL profiles
CREATE POLICY "Admin can read all profiles" 
ON public.profiles 
FOR SELECT 
USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- Create new policy: Manager can only read profiles of their group members
CREATE POLICY "Manager can read group member profiles" 
ON public.profiles 
FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'manager'::app_role 
  AND EXISTS (
    SELECT 1 FROM public.manager_groups mg
    JOIN public.group_members gm ON gm.group_id = mg.id
    WHERE mg.manager_user_id = auth.uid()
    AND gm.member_user_id = profiles.id
  )
);

-- Fix 2: Restrict manager access to orders - only see orders from their team members
-- Drop and recreate the orders SELECT policy
DROP POLICY IF EXISTS "Salesperson can view own orders" ON public.orders;

-- Create new policy: Salesperson and runner can view their own orders
CREATE POLICY "Users can view their orders" 
ON public.orders 
FOR SELECT 
USING (
  auth.uid() = salesperson_id 
  OR auth.uid() = runner_id
);

-- Create new policy: Admin can view ALL orders
CREATE POLICY "Admin can view all orders" 
ON public.orders 
FOR SELECT 
USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- Create new policy: Manager can only view orders from their group members
CREATE POLICY "Manager can view group member orders" 
ON public.orders 
FOR SELECT 
USING (
  get_user_role(auth.uid()) = 'manager'::app_role 
  AND EXISTS (
    SELECT 1 FROM public.manager_groups mg
    JOIN public.group_members gm ON gm.group_id = mg.id
    WHERE mg.manager_user_id = auth.uid()
    AND gm.member_user_id = orders.salesperson_id
  )
);