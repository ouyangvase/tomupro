-- Add INSERT policy for manager to create products for team members
CREATE POLICY "Manager can create products for team members"
ON public.products
FOR INSERT
WITH CHECK (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND (
    owner_user_id = auth.uid()
    OR is_in_manager_team(owner_user_id, auth.uid())
  )
);

-- Add UPDATE policy for manager to update team products
CREATE POLICY "Manager can update team products"
ON public.products
FOR UPDATE
USING (
  get_user_role(auth.uid()) = 'manager'::app_role
  AND (
    owner_user_id = auth.uid()
    OR is_in_manager_team(owner_user_id, auth.uid())
  )
);