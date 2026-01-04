-- Update handle_new_user to automatically create warehouses for salesperson/runner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_role public.app_role;
  requested_role text;
BEGIN
  -- Get role from metadata
  requested_role := NEW.raw_user_meta_data ->> 'role';
  
  -- SECURITY: Only allow driver for self-registration
  -- Admin, manager, salesperson, and runner roles must be assigned by existing admins
  IF requested_role = 'driver' THEN
    user_role := 'driver'::public.app_role;
  ELSE
    -- Default to driver for any other value (including admin/manager/salesperson/runner attempts)
    user_role := 'driver'::public.app_role;
  END IF;
  
  -- Insert into profiles
  INSERT INTO public.profiles (id, role, display_name, email)
  VALUES (
    NEW.id,
    user_role,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  
  -- Insert into user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$$;

-- Create trigger function to auto-create warehouse when role is updated to salesperson/runner
CREATE OR REPLACE FUNCTION public.auto_create_warehouse_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  warehouse_type text;
  existing_warehouse_id uuid;
BEGIN
  -- Only trigger when role changes to salesperson or runner
  IF NEW.role IN ('salesperson', 'runner') AND (OLD.role IS NULL OR OLD.role != NEW.role) THEN
    warehouse_type := CASE WHEN NEW.role = 'salesperson' THEN 'SALESPERSON' ELSE 'RUNNER' END;
    
    -- Check if warehouse already exists
    SELECT id INTO existing_warehouse_id
    FROM public.warehouses
    WHERE owner_user_id = NEW.id
      AND warehouse_type = warehouse_type::warehouse_type
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
        warehouse_type::warehouse_type,
        NEW.id,
        COALESCE(NEW.display_name, 'User') || '''s Warehouse',
        true
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table for role changes
DROP TRIGGER IF EXISTS on_profile_role_change ON public.profiles;
CREATE TRIGGER on_profile_role_change
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_warehouse_on_role_change();

-- DATA MIGRATION: Create missing warehouses for existing salespersons
INSERT INTO public.warehouses (warehouse_type, owner_user_id, name, is_active)
SELECT 
  'SALESPERSON'::warehouse_type,
  p.id,
  COALESCE(p.display_name, 'User') || '''s Warehouse',
  true
FROM public.profiles p
WHERE p.role = 'salesperson'
  AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.owner_user_id = p.id
      AND w.warehouse_type = 'SALESPERSON'
  );

-- Also create missing warehouses for existing runners
INSERT INTO public.warehouses (warehouse_type, owner_user_id, name, is_active)
SELECT 
  'RUNNER'::warehouse_type,
  p.id,
  COALESCE(p.display_name, 'User') || '''s Warehouse',
  true
FROM public.profiles p
WHERE p.role = 'runner'
  AND NOT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.owner_user_id = p.id
      AND w.warehouse_type = 'RUNNER'
  );