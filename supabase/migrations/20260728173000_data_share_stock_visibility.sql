-- Make Stock data sharing the source of truth for inventory visibility.
-- Read-only shares can view balances, while stock/order operations still
-- require an operational relationship or can_operate=true.

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
    OR EXISTS (
      SELECT 1
      FROM public.user_data_shares uds
      WHERE uds.viewer_user_id = viewer_id
        AND uds.subject_user_id = owner_id
        AND uds.active = true
        AND uds.scope_stock_balance = true
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
            FROM public.user_data_shares runner_share
            WHERE runner_share.viewer_user_id = ra.runner_id
              AND runner_share.subject_user_id = owner_id
              AND runner_share.active = true
              AND runner_share.scope_stock_balance = true
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

CREATE OR REPLACE FUNCTION public.can_operate_stock(owner_id uuid, viewer_id uuid)
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
        EXISTS (
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
    OR public.can_operate_on_shared_data(viewer_id, owner_id, 'stock')
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
          OR public.can_operate_on_shared_data(ra.runner_id, owner_id, 'stock')
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

CREATE OR REPLACE FUNCTION public.validate_order_inventory_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source_owner uuid;
  v_previous_owner uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.fulfillment_warehouse_id IS NOT DISTINCT FROM OLD.fulfillment_warehouse_id
     AND NEW.order_owner_id IS NOT DISTINCT FROM OLD.order_owner_id THEN
    RETURN NEW;
  END IF;

  IF NEW.fulfillment_warehouse_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.owner_user_id
    INTO v_source_owner
  FROM public.warehouses w
  WHERE w.id = NEW.fulfillment_warehouse_id
    AND w.is_active = true;

  IF v_source_owner IS NULL THEN
    RAISE EXCEPTION 'Selected inventory source is unavailable';
  END IF;

  IF v_source_owner IS DISTINCT FROM COALESCE(NEW.order_owner_id, NEW.salesperson_id) THEN
    RAISE EXCEPTION 'Inventory source must belong to the selected order owner';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.fulfillment_warehouse_id IS DISTINCT FROM OLD.fulfillment_warehouse_id
     AND NEW.order_owner_id IS NOT DISTINCT FROM OLD.order_owner_id
     AND OLD.fulfillment_warehouse_id IS NOT NULL THEN
    SELECT w.owner_user_id
      INTO v_previous_owner
    FROM public.warehouses w
    WHERE w.id = OLD.fulfillment_warehouse_id;

    IF v_previous_owner = v_source_owner THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_actor IS NULL AND auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL OR NOT public.can_operate_stock(v_source_owner, v_actor) THEN
    RAISE EXCEPTION 'You do not have permission to use the selected inventory source';
  END IF;

  RETURN NEW;
END;
$function$;

DO $block$
BEGIN
  IF to_regclass('public.runner_stock_locations') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Runners can insert own stock locations" ON public.runner_stock_locations';
    EXECUTE $policy$
      CREATE POLICY "Runners can insert own stock locations"
        ON public.runner_stock_locations
        FOR INSERT
        WITH CHECK (
          runner_id = auth.uid()
          AND updated_by = auth.uid()
          AND public.has_role(auth.uid(), 'runner')
          AND EXISTS (
            SELECT 1
            FROM public.warehouses w
            WHERE w.id = warehouse_id
              AND public.can_operate_stock(w.owner_user_id, auth.uid())
          )
        )
    $policy$;

    EXECUTE 'DROP POLICY IF EXISTS "Runners can update own stock locations" ON public.runner_stock_locations';
    EXECUTE $policy$
      CREATE POLICY "Runners can update own stock locations"
        ON public.runner_stock_locations
        FOR UPDATE
        USING (
          runner_id = auth.uid()
          AND public.has_role(auth.uid(), 'runner')
        )
        WITH CHECK (
          runner_id = auth.uid()
          AND updated_by = auth.uid()
          AND public.has_role(auth.uid(), 'runner')
          AND EXISTS (
            SELECT 1
            FROM public.warehouses w
            WHERE w.id = warehouse_id
              AND public.can_operate_stock(w.owner_user_id, auth.uid())
          )
        )
    $policy$;
  END IF;
END
$block$;

GRANT EXECUTE ON FUNCTION public.can_view_stock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_stock(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
