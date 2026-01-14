-- Drop the existing INSERT policy and recreate with manager role included
DROP POLICY IF EXISTS "Create stock movements for authorized users" ON public.stock_movements;

CREATE POLICY "Create stock movements for authorized users"
ON public.stock_movements
FOR INSERT
WITH CHECK (
  (auth.uid() = created_by) 
  AND (get_user_role(auth.uid()) = ANY (ARRAY['salesperson'::app_role, 'admin'::app_role, 'runner'::app_role, 'driver'::app_role, 'manager'::app_role]))
);