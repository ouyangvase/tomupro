-- Update handle_new_user function to allow driver role for self-registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  -- Drivers don't get auto-created warehouses (only salesperson/runner do)
  -- Driver needs to be linked to a runner via runner_drivers table by a runner
  
  RETURN NEW;
END;
$function$;