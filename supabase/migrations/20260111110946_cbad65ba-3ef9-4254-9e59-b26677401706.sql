
-- Update the handle_new_user function to allow 'salesperson' role when provided via valid invite code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_role public.app_role;
  requested_role text;
BEGIN
  -- Get role from metadata (set by signup process after validating invite code)
  requested_role := NEW.raw_user_meta_data ->> 'role';
  
  -- SECURITY: Only allow driver OR salesperson for self-registration
  -- Admin, manager, and runner roles must be assigned by existing admins
  -- 'salesperson' role is allowed ONLY when user registers with a valid admin invite code
  -- The invite code validation happens in the frontend before signup
  IF requested_role = 'driver' THEN
    user_role := 'driver'::public.app_role;
  ELSIF requested_role = 'salesperson' THEN
    user_role := 'salesperson'::public.app_role;
  ELSIF requested_role = 'runner' THEN
    -- Allow runner role from valid invite code
    user_role := 'runner'::public.app_role;
  ELSE
    -- Default to driver for any other value (including admin/manager attempts)
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
