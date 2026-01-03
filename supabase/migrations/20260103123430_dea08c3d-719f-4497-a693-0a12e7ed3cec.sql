-- Fix the driver_latest_location view to use SECURITY INVOKER
DROP VIEW IF EXISTS public.driver_latest_location;

CREATE OR REPLACE VIEW public.driver_latest_location 
WITH (security_invoker = true) AS
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