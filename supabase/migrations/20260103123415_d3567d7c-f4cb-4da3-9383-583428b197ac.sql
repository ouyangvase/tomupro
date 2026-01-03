-- Create driver_locations table for GPS tracking
CREATE TABLE public.driver_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX idx_driver_locations_driver_id ON public.driver_locations(driver_id);
CREATE INDEX idx_driver_locations_recorded_at ON public.driver_locations(recorded_at DESC);

-- Enable RLS
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Drivers can insert their own location
CREATE POLICY "Drivers can insert own location"
ON public.driver_locations
FOR INSERT
WITH CHECK (auth.uid() = driver_id);

-- Drivers can view own location
CREATE POLICY "Drivers can view own location"
ON public.driver_locations
FOR SELECT
USING (auth.uid() = driver_id);

-- Runners can view their drivers' locations
CREATE POLICY "Runners can view their drivers locations"
ON public.driver_locations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.runner_drivers rd
    WHERE rd.driver_id = driver_locations.driver_id
    AND rd.runner_id = auth.uid()
    AND rd.is_active = true
  )
);

-- Admins can view all locations
CREATE POLICY "Admins can view all locations"
ON public.driver_locations
FOR SELECT
USING (public.get_user_role(auth.uid()) = 'admin');

-- Create view for latest driver location
CREATE OR REPLACE VIEW public.driver_latest_location AS
SELECT DISTINCT ON (driver_id)
  dl.id,
  dl.driver_id,
  p.display_name as driver_name,
  dl.latitude,
  dl.longitude,
  dl.accuracy,
  dl.heading,
  dl.speed,
  dl.recorded_at
FROM public.driver_locations dl
JOIN public.profiles p ON p.id = dl.driver_id
ORDER BY dl.driver_id, dl.recorded_at DESC;

-- Enable realtime for driver_locations
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;