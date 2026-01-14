-- Drop existing policies on bindings
DROP POLICY IF EXISTS "Admins can manage bindings" ON public.bindings;
DROP POLICY IF EXISTS "Users can view their bindings" ON public.bindings;

-- SELECT: admin, salesperson (own bindings), manager (team's salesperson bindings)
CREATE POLICY "bindings_select_policy" ON public.bindings
FOR SELECT USING (
  -- Admin can see all
  get_user_role(auth.uid()) = 'admin'
  -- Salesperson can see own bindings
  OR (get_user_role(auth.uid()) = 'salesperson' AND salesperson_id = auth.uid())
  -- Runner can see bindings they're part of
  OR runner_id = auth.uid()
  -- Manager can see bindings for their team's salespersons
  OR (
    get_user_role(auth.uid()) = 'manager' 
    AND salesperson_id IN (
      SELECT gm.member_user_id 
      FROM group_members gm
      JOIN manager_groups mg ON mg.id = gm.group_id
      WHERE mg.manager_user_id = auth.uid()
    )
  )
);

-- INSERT: admin, salesperson (own bindings), manager (team's salesperson bindings)
CREATE POLICY "bindings_insert_policy" ON public.bindings
FOR INSERT WITH CHECK (
  -- Admin can insert all
  get_user_role(auth.uid()) = 'admin'
  -- Salesperson can insert own bindings
  OR (get_user_role(auth.uid()) = 'salesperson' AND salesperson_id = auth.uid())
  -- Manager can insert bindings for their team's salespersons
  OR (
    get_user_role(auth.uid()) = 'manager' 
    AND salesperson_id IN (
      SELECT gm.member_user_id 
      FROM group_members gm
      JOIN manager_groups mg ON mg.id = gm.group_id
      WHERE mg.manager_user_id = auth.uid()
    )
  )
);

-- UPDATE: admin, salesperson (own bindings), manager (team's salesperson bindings)
CREATE POLICY "bindings_update_policy" ON public.bindings
FOR UPDATE USING (
  -- Admin can update all
  get_user_role(auth.uid()) = 'admin'
  -- Salesperson can update own bindings
  OR (get_user_role(auth.uid()) = 'salesperson' AND salesperson_id = auth.uid())
  -- Manager can update bindings for their team's salespersons
  OR (
    get_user_role(auth.uid()) = 'manager' 
    AND salesperson_id IN (
      SELECT gm.member_user_id 
      FROM group_members gm
      JOIN manager_groups mg ON mg.id = gm.group_id
      WHERE mg.manager_user_id = auth.uid()
    )
  )
);

-- DELETE: admin, salesperson (own bindings), manager (team's salesperson bindings)
CREATE POLICY "bindings_delete_policy" ON public.bindings
FOR DELETE USING (
  -- Admin can delete all
  get_user_role(auth.uid()) = 'admin'
  -- Salesperson can delete own bindings
  OR (get_user_role(auth.uid()) = 'salesperson' AND salesperson_id = auth.uid())
  -- Manager can delete bindings for their team's salespersons
  OR (
    get_user_role(auth.uid()) = 'manager' 
    AND salesperson_id IN (
      SELECT gm.member_user_id 
      FROM group_members gm
      JOIN manager_groups mg ON mg.id = gm.group_id
      WHERE mg.manager_user_id = auth.uid()
    )
  )
);