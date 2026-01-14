-- Update is_in_manager_team to also check manager_salesperson_bindings (keep same parameter names)
CREATE OR REPLACE FUNCTION public.is_in_manager_team(salesperson_user_id UUID, manager_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.manager_salesperson_bindings 
    WHERE manager_id = manager_user_id 
    AND salesperson_id = salesperson_user_id 
    AND active = true
  ) OR EXISTS (
    SELECT 1 FROM public.group_members gm
    JOIN public.manager_groups mg ON mg.id = gm.group_id
    WHERE mg.manager_user_id = manager_user_id
    AND gm.member_user_id = salesperson_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to auto-populate manager snapshot on order insert
CREATE OR REPLACE FUNCTION public.set_order_manager_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  v_manager_id UUID;
  v_manager_name TEXT;
  v_salesperson_name TEXT;
  v_salesperson_role app_role;
BEGIN
  -- Get salesperson info
  SELECT display_name, role INTO v_salesperson_name, v_salesperson_role
  FROM public.profiles WHERE id = NEW.salesperson_id;
  
  NEW.owner_salesperson_id_snapshot := NEW.salesperson_id;
  NEW.owner_salesperson_display_name_snapshot := v_salesperson_name;
  
  -- If salesperson_id is actually a manager, they are self-managing
  IF v_salesperson_role = 'manager' THEN
    NEW.owner_manager_id_snapshot := NEW.salesperson_id;
    NEW.owner_manager_display_name_snapshot := v_salesperson_name;
  ELSE
    -- Find manager through manager_salesperson_bindings first
    SELECT msb.manager_id, p.display_name 
    INTO v_manager_id, v_manager_name
    FROM public.manager_salesperson_bindings msb
    JOIN public.profiles p ON p.id = msb.manager_id
    WHERE msb.salesperson_id = NEW.salesperson_id AND msb.active = true
    LIMIT 1;
    
    -- If not found in msb, try group_members
    IF v_manager_id IS NULL THEN
      SELECT mg.manager_user_id, p.display_name
      INTO v_manager_id, v_manager_name
      FROM public.group_members gm
      JOIN public.manager_groups mg ON mg.id = gm.group_id
      JOIN public.profiles p ON p.id = mg.manager_user_id
      WHERE gm.member_user_id = NEW.salesperson_id
      LIMIT 1;
    END IF;
    
    NEW.owner_manager_id_snapshot := v_manager_id;
    NEW.owner_manager_display_name_snapshot := v_manager_name;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for order manager snapshot
DROP TRIGGER IF EXISTS trg_set_order_manager_snapshot ON public.orders;
CREATE TRIGGER trg_set_order_manager_snapshot
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_manager_snapshot();

-- Function to auto-create manager warehouse on role change
CREATE OR REPLACE FUNCTION public.ensure_manager_warehouse()
RETURNS TRIGGER AS $$
BEGIN
  -- If role changed to manager, ensure warehouse exists
  IF NEW.role = 'manager' AND (OLD IS NULL OR OLD.role IS NULL OR OLD.role != 'manager') THEN
    INSERT INTO public.warehouses (owner_user_id, warehouse_type, name, is_active)
    VALUES (NEW.id, 'MANAGER', NEW.display_name || '''s Warehouse', true)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for manager warehouse
DROP TRIGGER IF EXISTS trg_ensure_manager_warehouse ON public.profiles;
CREATE TRIGGER trg_ensure_manager_warehouse
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_manager_warehouse();

-- Backfill existing manager warehouses
INSERT INTO public.warehouses (owner_user_id, warehouse_type, name, is_active)
SELECT p.id, 'MANAGER', p.display_name || '''s Warehouse', true
FROM public.profiles p
WHERE p.role = 'manager' AND p.is_active = true
AND NOT EXISTS (
  SELECT 1 FROM public.warehouses w 
  WHERE w.owner_user_id = p.id AND w.warehouse_type = 'MANAGER'
)
ON CONFLICT DO NOTHING;

-- Backfill order snapshots
UPDATE public.orders o
SET 
  owner_salesperson_id_snapshot = o.salesperson_id,
  owner_salesperson_display_name_snapshot = sp.display_name,
  owner_manager_id_snapshot = COALESCE(
    (SELECT msb.manager_id FROM public.manager_salesperson_bindings msb 
     WHERE msb.salesperson_id = o.salesperson_id AND msb.active = true LIMIT 1),
    (SELECT mg.manager_user_id FROM public.group_members gm 
     JOIN public.manager_groups mg ON mg.id = gm.group_id 
     WHERE gm.member_user_id = o.salesperson_id LIMIT 1),
    CASE WHEN sp.role = 'manager' THEN o.salesperson_id ELSE NULL END
  ),
  owner_manager_display_name_snapshot = COALESCE(
    (SELECT mp.display_name FROM public.manager_salesperson_bindings msb 
     JOIN public.profiles mp ON mp.id = msb.manager_id
     WHERE msb.salesperson_id = o.salesperson_id AND msb.active = true LIMIT 1),
    (SELECT mp.display_name FROM public.group_members gm 
     JOIN public.manager_groups mg ON mg.id = gm.group_id 
     JOIN public.profiles mp ON mp.id = mg.manager_user_id
     WHERE gm.member_user_id = o.salesperson_id LIMIT 1),
    CASE WHEN sp.role = 'manager' THEN sp.display_name ELSE NULL END
  )
FROM public.profiles sp
WHERE sp.id = o.salesperson_id
AND o.owner_salesperson_id_snapshot IS NULL;

-- Update inbound_shipments RLS to enforce manager isolation
DROP POLICY IF EXISTS "Inbound shipments viewable by relevant users" ON public.inbound_shipments;
DROP POLICY IF EXISTS "Inbound shipments scoped visibility" ON public.inbound_shipments;

CREATE POLICY "Inbound shipments scoped visibility"
  ON public.inbound_shipments FOR SELECT
  USING (
    get_user_role(auth.uid()) = 'admin'::app_role
    OR auth.uid() = runner_id
    OR auth.uid() = salesperson_id
    OR (get_user_role(auth.uid()) = 'manager'::app_role AND (
      salesperson_id = auth.uid()
      OR is_in_manager_team(salesperson_id, auth.uid())
    ))
  );