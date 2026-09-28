-- Internal order triggers must not require authenticated users to access the
-- private schema just to insert or update a public.orders row.
ALTER FUNCTION private.guard_driver_assignment_lifecycle_state()
  SECURITY DEFINER;

ALTER FUNCTION private.guard_driver_assignment_lifecycle_state()
  SET search_path TO public, pg_temp;

REVOKE ALL ON FUNCTION private.guard_driver_assignment_lifecycle_state()
  FROM PUBLIC, anon, authenticated, service_role;

