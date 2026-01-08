-- Fix: Restrict user_directory access based on business needs
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "User directory readable by all authenticated" ON public.user_directory;

-- Admin can see all users
CREATE POLICY "Admin can read full user directory" 
ON public.user_directory FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

-- Managers can see their group members + own profile
CREATE POLICY "Manager can read group member directory"
ON public.user_directory FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'manager'
  AND (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.manager_groups mg
      JOIN public.group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = auth.uid()
      AND gm.member_user_id = user_directory.id
    )
  )
);

-- Runners can see their drivers, other runners/salespersons (for dropdowns), and own profile
CREATE POLICY "Runner can read relevant directory entries"
ON public.user_directory FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'runner'
  AND (
    id = auth.uid()
    OR role = 'driver'
    OR role IN ('salesperson', 'runner')
  )
);

-- Salespersons can see runners (for assignment dropdowns) and own profile
CREATE POLICY "Salesperson can read relevant directory entries"
ON public.user_directory FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'salesperson'
  AND (
    id = auth.uid()
    OR role = 'runner'
  )
);

-- Drivers can see their parent runner and own profile
CREATE POLICY "Driver can read relevant directory entries"
ON public.user_directory FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'driver'
  AND (
    id = auth.uid()
    OR (
      role = 'runner' 
      AND EXISTS (
        SELECT 1 FROM public.runner_drivers rd
        WHERE rd.driver_id = auth.uid()
        AND rd.runner_id = user_directory.id
        AND rd.is_active = true
      )
    )
  )
);

-- Users with 'user' role can only see own profile
CREATE POLICY "User can read own directory entry"
ON public.user_directory FOR SELECT
USING (
  public.get_user_role(auth.uid()) = 'user'
  AND id = auth.uid()
);