-- Fix the ambiguous column reference in auto_create_warehouse_on_role_change trigger
CREATE OR REPLACE FUNCTION public.auto_create_warehouse_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_type text;
  existing_warehouse_id uuid;
BEGIN
  -- Only trigger when role changes to salesperson or runner
  IF NEW.role IN ('salesperson', 'runner') AND (OLD.role IS NULL OR OLD.role != NEW.role) THEN
    v_warehouse_type := CASE WHEN NEW.role = 'salesperson' THEN 'SALESPERSON' ELSE 'RUNNER' END;
    
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
$$;