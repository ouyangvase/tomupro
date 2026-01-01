-- Drop the overly broad claims SELECT policy
DROP POLICY IF EXISTS "Claims viewable by related parties" ON public.claims;

-- Create a more restrictive policy: only claim creator, order's assigned runner, and admins/managers can view
CREATE POLICY "Claims viewable by authorized parties only"
ON public.claims
FOR SELECT
USING (
  -- The user who created the claim can view it
  auth.uid() = created_by
  OR
  -- The assigned runner for that specific order can view it
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = claims.order_id
    AND o.runner_id = auth.uid()
  )
  OR
  -- Admins and managers can view all claims
  get_user_role(auth.uid()) = ANY (ARRAY['admin'::app_role, 'manager'::app_role])
);