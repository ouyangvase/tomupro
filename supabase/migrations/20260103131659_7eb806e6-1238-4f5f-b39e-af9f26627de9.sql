-- Add driver_code column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS driver_code text;

-- Create unique index for driver_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_driver_code ON public.profiles(driver_code) WHERE driver_code IS NOT NULL;

-- Function for runners to generate driver code for their drivers
CREATE OR REPLACE FUNCTION public.generate_driver_code(p_driver_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runner_id UUID;
  v_new_code TEXT;
  v_driver_role app_role;
BEGIN
  v_runner_id := auth.uid();
  
  -- Check caller is a runner or admin
  IF get_user_role(v_runner_id) NOT IN ('runner', 'admin') THEN
    RETURN json_build_object('success', false, 'error', 'Only runners can generate driver codes');
  END IF;
  
  -- Check target user is a driver
  SELECT role INTO v_driver_role FROM public.profiles WHERE id = p_driver_id;
  IF v_driver_role != 'driver' THEN
    RETURN json_build_object('success', false, 'error', 'Target user is not a driver');
  END IF;
  
  -- Check if runner owns this driver (or is admin)
  IF get_user_role(v_runner_id) = 'runner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.runner_drivers 
      WHERE runner_id = v_runner_id AND driver_id = p_driver_id AND is_active = true
    ) THEN
      RETURN json_build_object('success', false, 'error', 'This driver is not assigned to you');
    END IF;
  END IF;
  
  -- Generate unique 6-digit code
  LOOP
    v_new_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE driver_code = v_new_code);
  END LOOP;
  
  -- Update driver's code
  UPDATE public.profiles SET driver_code = v_new_code WHERE id = p_driver_id;
  
  RETURN json_build_object('success', true, 'code', v_new_code);
END;
$$;