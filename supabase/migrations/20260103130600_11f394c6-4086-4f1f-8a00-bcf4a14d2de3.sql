-- Add runner_code column to profiles for runners to share with drivers
ALTER TABLE public.profiles 
ADD COLUMN runner_code TEXT UNIQUE;

-- Generate initial codes for existing runners
UPDATE public.profiles 
SET runner_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6))
WHERE role = 'runner' AND runner_code IS NULL;

-- Create function to generate runner code on profile creation for runners
CREATE OR REPLACE FUNCTION public.generate_runner_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'runner' AND NEW.runner_code IS NULL THEN
    NEW.runner_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NEW.id::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate runner code
CREATE TRIGGER generate_runner_code_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.generate_runner_code();

-- Function for driver to link themselves to a runner by code
CREATE OR REPLACE FUNCTION public.link_driver_to_runner_by_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver_id UUID;
  v_runner_id UUID;
  v_runner_name TEXT;
  v_existing_link UUID;
BEGIN
  -- Get current user
  v_driver_id := auth.uid();
  
  IF v_driver_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Verify user is a driver
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_driver_id AND role = 'driver') THEN
    RETURN json_build_object('success', false, 'error', 'Only drivers can use this feature');
  END IF;
  
  -- Check if driver already linked to a runner
  SELECT id INTO v_existing_link FROM public.runner_drivers 
  WHERE driver_id = v_driver_id AND is_active = true;
  
  IF v_existing_link IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are already linked to a runner');
  END IF;
  
  -- Find runner by code
  SELECT id, display_name INTO v_runner_id, v_runner_name
  FROM public.profiles
  WHERE runner_code = UPPER(p_code) AND role = 'runner' AND is_active = true;
  
  IF v_runner_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid runner code');
  END IF;
  
  -- Create the link
  INSERT INTO public.runner_drivers (runner_id, driver_id, is_active)
  VALUES (v_runner_id, v_driver_id, true)
  ON CONFLICT (driver_id) DO UPDATE SET 
    runner_id = v_runner_id,
    is_active = true;
  
  RETURN json_build_object(
    'success', true, 
    'runner_id', v_runner_id,
    'runner_name', v_runner_name
  );
END;
$$;

-- Allow drivers to view their own profile runner_code field
-- (runners need to see their own code to share it)