-- Fix can_access_order_items to include data sharing and manager group visibility
CREATE OR REPLACE FUNCTION public.can_access_order_items(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = p_order_id
    AND (
      -- Direct assignment
      o.salesperson_id = auth.uid()
      OR o.runner_id = auth.uid()
      OR o.driver_id = auth.uid()
      
      -- Admin can see all
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      
      -- Manager visibility (via bindings, groups, or legacy manager_id)
      OR (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager')
        AND (
          o.salesperson_id = auth.uid()
          -- manager_salesperson_bindings
          OR EXISTS (
            SELECT 1 FROM manager_salesperson_bindings
            WHERE manager_id = auth.uid() AND salesperson_id = o.salesperson_id AND active = true
          )
          -- manager_groups
          OR EXISTS (
            SELECT 1 FROM manager_groups mg
            JOIN group_members gm ON gm.group_id = mg.id
            WHERE mg.manager_user_id = auth.uid() AND gm.member_user_id = o.salesperson_id
          )
          -- legacy profiles.manager_id
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = o.salesperson_id AND manager_id = auth.uid()
          )
        )
      )
      
      -- Data sharing visibility (orders scope)
      OR EXISTS (
        SELECT 1 FROM user_data_shares
        WHERE viewer_user_id = auth.uid()
          AND subject_user_id = o.salesperson_id
          AND active = true
          AND scope_orders = true
      )
    )
  );
$function$;