-- A current Driver assignment owns the delivery outcome. A Runner may manage
-- the assignment, but cannot mark the order Delivered or Failed from Runner
-- Inbox while that assignment is still attached.
CREATE OR REPLACE FUNCTION private.guard_runner_delivery_on_driver_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- The canonical Dispatch > Drivers review RPC is the only trusted path
  -- that may finalize a Driver-submitted result.
  IF current_setting('app.dispatch_driver_review', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.driver_id, OLD.driver_id) IS NOT NULL
    AND NEW.runner_status::text IN ('DELIVERED', 'FAILED_DELIVERY')
    AND NEW.runner_status IS DISTINCT FROM OLD.runner_status
  THEN
    RAISE EXCEPTION 'Runner cannot complete an order with a current Driver assignment. Review the Driver result from Dispatch > Drivers or release the assignment first'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_runner_delivery_on_driver_assignment ON public.orders;
CREATE TRIGGER guard_runner_delivery_on_driver_assignment
BEFORE UPDATE OF runner_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.guard_runner_delivery_on_driver_assignment();

REVOKE ALL ON FUNCTION private.guard_runner_delivery_on_driver_assignment()
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
