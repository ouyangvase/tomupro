-- Keep the orders lifecycle trigger usable by client updates without exposing
-- the private schema to authenticated users.
ALTER FUNCTION private.enforce_final_order_lifecycle()
  SECURITY DEFINER;

ALTER FUNCTION private.enforce_final_order_lifecycle()
  SET search_path TO public, pg_temp;

REVOKE ALL ON FUNCTION private.enforce_final_order_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;
