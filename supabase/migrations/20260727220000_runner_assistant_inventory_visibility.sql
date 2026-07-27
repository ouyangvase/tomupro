-- Give a runner assistant with Stock Balance & Audit permission the same
-- stock visibility as the runner they are actively assigned to.

CREATE OR REPLACE FUNCTION public.can_view_stock(owner_id uuid, viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    viewer_id = owner_id
    OR public.get_user_role(viewer_id) = 'admin'
    OR (
      public.get_user_role(viewer_id) = 'manager'
      AND (
        viewer_id = owner_id
        OR EXISTS (
          SELECT 1
          FROM public.manager_groups mg
          JOIN public.group_members gm ON gm.group_id = mg.id
          WHERE mg.manager_user_id = viewer_id
            AND gm.member_user_id = owner_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.manager_salesperson_bindings msb
          WHERE msb.manager_id = viewer_id
            AND msb.salesperson_id = owner_id
            AND msb.active = true
        )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.stock_visibility_overrides svo
      WHERE svo.viewer_user_id = viewer_id
        AND svo.owner_user_id = owner_id
        AND svo.can_view = true
    )
    OR (
      public.get_user_role(viewer_id) = 'runner'
      AND EXISTS (
        SELECT 1
        FROM public.bindings b
        WHERE b.runner_id = viewer_id
          AND b.salesperson_id = owner_id
          AND b.active = true
      )
    )
    OR (
      public.get_user_role(viewer_id) = 'runner'
      AND EXISTS (
        SELECT 1
        FROM public.manager_runner_bindings mrb
        WHERE mrb.runner_id = viewer_id
          AND mrb.manager_id = owner_id
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.warehouse_members wm
      JOIN public.warehouses w ON w.id = wm.warehouse_id
      WHERE w.owner_user_id = owner_id
        AND w.is_active = true
        AND wm.user_id = viewer_id
        AND wm.active = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = viewer_id
        AND ra.is_active = true
        AND ra.can_view_stock_audit = true
        AND (
          owner_id = ra.runner_id
          OR EXISTS (
            SELECT 1
            FROM public.stock_visibility_overrides runner_override
            WHERE runner_override.viewer_user_id = ra.runner_id
              AND runner_override.owner_user_id = owner_id
              AND runner_override.can_view = true
          )
          OR EXISTS (
            SELECT 1
            FROM public.bindings runner_binding
            WHERE runner_binding.runner_id = ra.runner_id
              AND runner_binding.salesperson_id = owner_id
              AND runner_binding.active = true
          )
          OR EXISTS (
            SELECT 1
            FROM public.manager_runner_bindings runner_manager
            WHERE runner_manager.runner_id = ra.runner_id
              AND runner_manager.manager_id = owner_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.warehouse_members runner_membership
            JOIN public.warehouses runner_warehouse
              ON runner_warehouse.id = runner_membership.warehouse_id
            WHERE runner_warehouse.owner_user_id = owner_id
              AND runner_warehouse.is_active = true
              AND runner_membership.user_id = ra.runner_id
              AND runner_membership.active = true
          )
        )
    )
$function$;

GRANT EXECUTE ON FUNCTION public.can_view_stock(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
