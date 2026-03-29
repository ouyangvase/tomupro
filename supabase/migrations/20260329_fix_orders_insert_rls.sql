-- Fix: Allow runners to create pickup orders
-- Previous policy only allowed: salesperson (own orders), admin, manager
-- Runners were blocked because they set runner_id = auth.uid() but salesperson_id = order_owner_id
-- Fix: Add auth.uid() = runner_id to the INSERT policy

DROP POLICY IF EXISTS "Salesperson and manager can create orders" ON public.orders;
DROP POLICY IF EXISTS "Salesperson can create orders" ON public.orders;

CREATE POLICY "Users can create orders" ON public.orders
  FOR INSERT WITH CHECK (
    auth.uid() = salesperson_id
    OR auth.uid() = runner_id
    OR get_user_role(auth.uid()) = 'admin'::app_role
    OR get_user_role(auth.uid()) = 'manager'::app_role
  );
