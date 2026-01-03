-- Allow runners to view profiles of their drivers
CREATE POLICY "Runner can view their drivers profiles"
ON public.profiles
FOR SELECT
USING (
  (get_user_role(auth.uid()) = 'runner'::app_role) 
  AND EXISTS (
    SELECT 1 
    FROM runner_drivers rd
    WHERE rd.runner_id = auth.uid() 
    AND rd.driver_id = profiles.id
    AND rd.is_active = true
  )
);