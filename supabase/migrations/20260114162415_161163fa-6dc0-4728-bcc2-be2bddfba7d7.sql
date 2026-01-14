-- Fix: Allow managers to read runners bound to them via manager_runner_bindings in user_directory
-- Current policy only allows reading group members, but runners are bound separately

-- Drop the existing manager policy
DROP POLICY IF EXISTS "Manager can read group member directory" ON public.user_directory;

-- Create updated policy that includes:
-- 1. Their own entry
-- 2. Group members (salespersons under them)
-- 3. Runners bound to them via manager_runner_bindings
CREATE POLICY "Manager can read group member directory" 
ON public.user_directory 
FOR SELECT 
USING (
  (get_user_role(auth.uid()) = 'manager'::app_role) AND (
    -- Own entry
    id = auth.uid() 
    OR 
    -- Group members (salespersons under them)
    EXISTS (
      SELECT 1
      FROM manager_groups mg
      JOIN group_members gm ON gm.group_id = mg.id
      WHERE mg.manager_user_id = auth.uid() AND gm.member_user_id = user_directory.id
    )
    OR
    -- Runners bound to this manager
    EXISTS (
      SELECT 1
      FROM manager_runner_bindings mrb
      WHERE mrb.manager_id = auth.uid() AND mrb.runner_id = user_directory.id
    )
    OR
    -- All runners (for binding UI purposes - managers need to see available runners)
    role = 'runner'::app_role
  )
);