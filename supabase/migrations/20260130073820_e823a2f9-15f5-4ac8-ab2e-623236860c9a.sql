-- Drop existing runner policy on user_directory
DROP POLICY IF EXISTS "Runner can read relevant directory entries" ON public.user_directory;

-- Create updated policy including managers
CREATE POLICY "Runner can read relevant directory entries"
ON public.user_directory FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'runner'
  AND (
    id = auth.uid()
    OR role = 'driver'
    OR role IN ('salesperson', 'runner', 'manager')
  )
);