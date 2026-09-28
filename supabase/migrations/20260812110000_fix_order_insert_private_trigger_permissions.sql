-- The lifecycle trigger is an internal implementation detail of public.orders.
-- It must not require authenticated callers to have access to the private
-- schema when they insert or update an order.
ALTER FUNCTION private.enforce_final_order_lifecycle()
  SECURITY DEFINER;

ALTER FUNCTION private.enforce_final_order_lifecycle()
  SET search_path = public, pg_temp;

-- Keep the helper unreachable through the Data API; the orders trigger is the
-- only supported entry point and runs it with the function owner's rights.
REVOKE ALL ON FUNCTION private.enforce_final_order_lifecycle()
  FROM PUBLIC, anon, authenticated, service_role;
