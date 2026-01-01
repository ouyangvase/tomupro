-- Fix handle_new_user to only allow salesperson/runner roles for self-registration
-- Admin/manager roles must be assigned by existing admins via profile update
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.app_role;
  requested_role text;
  new_warehouse_id UUID;
BEGIN
  -- Get role from metadata
  requested_role := NEW.raw_user_meta_data ->> 'role';
  
  -- SECURITY: Only allow salesperson or runner for self-registration
  -- Admin and manager roles must be assigned by existing admins
  IF requested_role IN ('salesperson', 'runner') THEN
    user_role := requested_role::public.app_role;
  ELSE
    -- Default to salesperson for any other value (including admin/manager attempts)
    user_role := 'salesperson'::public.app_role;
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
  
  -- Auto-create warehouse for salesperson or runner
  IF user_role IN ('salesperson', 'runner') THEN
    INSERT INTO public.warehouses (warehouse_type, owner_user_id, name)
    VALUES (
      CASE WHEN user_role = 'salesperson' THEN 'SALESPERSON'::public.warehouse_type ELSE 'RUNNER'::public.warehouse_type END,
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)) || '''s Warehouse'
    );
  END IF;
  
  RETURN NEW;
END;
$$;