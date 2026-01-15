
-- 1. Update stock_balance_view to include managers
DROP VIEW IF EXISTS public.stock_balance_view CASCADE;

CREATE VIEW public.stock_balance_view AS
SELECT 
  sm.warehouse_id,
  w.name AS warehouse_name,
  w.owner_user_id,
  p.display_name AS owner_name,
  sm.product_id,
  pr.sku_code,
  pr.sku_name,
  sum(sm.qty_change) AS balance_qty,
  max(sm.created_at) AS last_movement_time
FROM stock_movements sm
  JOIN warehouses w ON w.id = sm.warehouse_id
  JOIN profiles p ON p.id = w.owner_user_id
  JOIN products pr ON pr.id = sm.product_id
WHERE sm.product_id IS NOT NULL 
  AND pr.sku_code IS NOT NULL 
  AND p.role IN ('salesperson', 'manager', 'admin')  -- INCLUDE MANAGERS
GROUP BY sm.warehouse_id, w.name, w.owner_user_id, p.display_name, sm.product_id, pr.sku_code, pr.sku_name
HAVING sum(sm.qty_change) <> 0;

-- 2. Update can_view_stock function to include runner viewing manager stock
CREATE OR REPLACE FUNCTION public.can_view_stock(owner_id uuid, viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    -- Same user (owner viewing own stock)
    viewer_id = owner_id
    OR
    -- Admin can view all
    get_user_role(viewer_id) = 'admin'
    OR
    -- Manager can view their own stock OR members in their group
    (
      get_user_role(viewer_id) = 'manager'
      AND (
        viewer_id = owner_id  -- Manager viewing own stock
        OR EXISTS (
          SELECT 1 FROM public.manager_groups mg
          JOIN public.group_members gm ON gm.group_id = mg.id
          WHERE mg.manager_user_id = viewer_id
          AND gm.member_user_id = owner_id
        )
        OR EXISTS (
          SELECT 1 FROM public.manager_salesperson_bindings msb
          WHERE msb.manager_id = viewer_id
          AND msb.salesperson_id = owner_id
          AND msb.active = true
        )
      )
    )
    OR
    -- Explicit visibility override granted
    EXISTS (
      SELECT 1 FROM public.stock_visibility_overrides svo
      WHERE svo.viewer_user_id = viewer_id
      AND svo.owner_user_id = owner_id
      AND svo.can_view = true
    )
    OR
    -- Runner can view bound salesperson stock
    (
      get_user_role(viewer_id) = 'runner'
      AND EXISTS (
        SELECT 1 FROM public.bindings b
        WHERE b.runner_id = viewer_id
        AND b.salesperson_id = owner_id
        AND b.active = true
      )
    )
    OR
    -- Runner can view bound MANAGER stock
    (
      get_user_role(viewer_id) = 'runner'
      AND EXISTS (
        SELECT 1 FROM public.manager_runner_bindings mrb
        WHERE mrb.runner_id = viewer_id
        AND mrb.manager_id = owner_id
      )
    )
$function$;

-- 3. Recreate get_stock_balance function to use updated view
CREATE OR REPLACE FUNCTION public.get_stock_balance()
RETURNS TABLE (
  warehouse_id uuid,
  warehouse_name text,
  owner_user_id uuid,
  owner_name text,
  product_id uuid,
  sku_code text,
  sku_name text,
  balance_qty bigint,
  last_movement_time timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    sbv.warehouse_id,
    sbv.warehouse_name,
    sbv.owner_user_id,
    sbv.owner_name,
    sbv.product_id,
    sbv.sku_code,
    sbv.sku_name,
    sbv.balance_qty,
    sbv.last_movement_time
  FROM stock_balance_view sbv
  INNER JOIN warehouses w ON w.id = sbv.warehouse_id
  WHERE can_view_stock(w.owner_user_id, auth.uid())
  ORDER BY sbv.owner_name, sbv.sku_code NULLS LAST;
END;
$function$;

-- 4. Update v_runner_target_users view to ensure proper warehouse type preference
DROP VIEW IF EXISTS public.v_runner_target_users;

CREATE OR REPLACE VIEW public.v_runner_target_users AS
-- Salespersons bound to runner
SELECT 
  b.runner_id,
  p.id AS user_id,
  p.display_name AS name,
  p.email,
  p.role,
  COALESCE(
    (SELECT w.id FROM warehouses w 
     WHERE w.owner_user_id = p.id 
     AND w.warehouse_type = 'SALESPERSON' 
     AND w.is_active = true 
     ORDER BY w.created_at DESC LIMIT 1),
    (SELECT w.id FROM warehouses w 
     WHERE w.owner_user_id = p.id 
     AND w.is_active = true 
     ORDER BY w.created_at DESC LIMIT 1)
  ) AS warehouse_id
FROM bindings b
JOIN profiles p ON p.id = b.salesperson_id
WHERE b.active = true

UNION ALL

-- Managers bound to runner
SELECT 
  m.runner_id,
  p.id AS user_id,
  p.display_name AS name,
  p.email,
  p.role,
  COALESCE(
    (SELECT w.id FROM warehouses w 
     WHERE w.owner_user_id = p.id 
     AND w.warehouse_type = 'MANAGER' 
     AND w.is_active = true 
     ORDER BY w.created_at DESC LIMIT 1),
    (SELECT w.id FROM warehouses w 
     WHERE w.owner_user_id = p.id 
     AND w.is_active = true 
     ORDER BY w.created_at DESC LIMIT 1)
  ) AS warehouse_id
FROM manager_runner_bindings m
JOIN profiles p ON p.id = m.manager_id;

-- 5. Update auto_create_warehouse_on_role_change to include managers
CREATE OR REPLACE FUNCTION public.auto_create_warehouse_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warehouse_type text;
  existing_warehouse_id uuid;
BEGIN
  -- Only trigger when role changes to salesperson, runner, or manager
  IF NEW.role IN ('salesperson', 'runner', 'manager') AND (OLD.role IS NULL OR OLD.role != NEW.role) THEN
    v_warehouse_type := CASE 
      WHEN NEW.role = 'salesperson' THEN 'SALESPERSON' 
      WHEN NEW.role = 'manager' THEN 'MANAGER'
      ELSE 'RUNNER' 
    END;
    
    -- Check if warehouse already exists
    SELECT w.id INTO existing_warehouse_id
    FROM public.warehouses w
    WHERE w.owner_user_id = NEW.id
      AND w.warehouse_type = v_warehouse_type::warehouse_type
    LIMIT 1;
    
    IF existing_warehouse_id IS NOT NULL THEN
      -- Reactivate if inactive
      UPDATE public.warehouses
      SET is_active = true
      WHERE id = existing_warehouse_id AND is_active = false;
    ELSE
      -- Create new warehouse
      INSERT INTO public.warehouses (warehouse_type, owner_user_id, name, is_active)
      VALUES (
        v_warehouse_type::warehouse_type,
        NEW.id,
        COALESCE(NEW.display_name, 'User') || '''s Warehouse',
        true
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 6. Create missing MANAGER warehouses for existing managers
INSERT INTO public.warehouses (warehouse_type, owner_user_id, name, is_active)
SELECT 
  'MANAGER'::warehouse_type,
  p.id,
  COALESCE(p.display_name, 'Manager') || '''s Warehouse',
  true
FROM profiles p
WHERE p.role = 'manager'
AND NOT EXISTS (
  SELECT 1 FROM warehouses w 
  WHERE w.owner_user_id = p.id 
  AND w.warehouse_type = 'MANAGER' 
  AND w.is_active = true
);

-- 7. Update inbound shipment RLS to allow managers to see their own and team shipments
DROP POLICY IF EXISTS "Manager can view own and team inbound" ON public.inbound_shipments;

CREATE POLICY "Manager can view own and team inbound"
ON public.inbound_shipments
FOR SELECT
TO authenticated
USING (
  -- Manager can see shipments targeting themselves
  salesperson_id = auth.uid()
  OR
  -- Manager can see shipments targeting their team salespersons
  (
    get_user_role(auth.uid()) = 'manager'
    AND (
      salesperson_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM manager_salesperson_bindings msb
        WHERE msb.manager_id = auth.uid()
        AND msb.salesperson_id = inbound_shipments.salesperson_id
        AND msb.active = true
      )
      OR EXISTS (
        SELECT 1 FROM manager_groups mg
        JOIN group_members gm ON gm.group_id = mg.id
        WHERE mg.manager_user_id = auth.uid()
        AND gm.member_user_id = inbound_shipments.salesperson_id
      )
    )
  )
);

-- 8. Update warehouses RLS for managers to see team warehouses
DROP POLICY IF EXISTS "Manager can view own and team warehouses" ON public.warehouses;

CREATE POLICY "Manager can view own and team warehouses"
ON public.warehouses
FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR
  (
    get_user_role(auth.uid()) = 'manager'
    AND (
      EXISTS (
        SELECT 1 FROM manager_salesperson_bindings msb
        WHERE msb.manager_id = auth.uid()
        AND msb.salesperson_id = warehouses.owner_user_id
        AND msb.active = true
      )
      OR EXISTS (
        SELECT 1 FROM manager_groups mg
        JOIN group_members gm ON gm.group_id = mg.id
        WHERE mg.manager_user_id = auth.uid()
        AND gm.member_user_id = warehouses.owner_user_id
      )
    )
  )
);

-- 9. Update stock_movements RLS for managers
DROP POLICY IF EXISTS "Manager can view team stock movements" ON public.stock_movements;

CREATE POLICY "Manager can view team stock movements"
ON public.stock_movements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = stock_movements.warehouse_id
    AND can_view_stock(w.owner_user_id, auth.uid())
  )
);
