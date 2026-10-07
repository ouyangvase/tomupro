-- Managers can edit orders owned by themselves or their assigned team.
-- Keep the same boundary used by the existing manager read and payment rules.
DROP POLICY IF EXISTS "Manager can update team orders" ON public.orders;

CREATE POLICY "Manager can update team orders"
  ON public.orders
  FOR UPDATE
  USING (
    get_user_role(auth.uid()) = 'manager'
    AND (
      salesperson_id = auth.uid()
      OR is_in_manager_team(salesperson_id, auth.uid())
    )
  )
  WITH CHECK (
    get_user_role(auth.uid()) = 'manager'
    AND (
      salesperson_id = auth.uid()
      OR is_in_manager_team(salesperson_id, auth.uid())
    )
  );
