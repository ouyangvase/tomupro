-- Only an active Driver assignment can block the Runner delivery action.
-- Historical Driver status must not block a new Runner delivery cycle after
-- driver_id has been released.
CREATE OR REPLACE FUNCTION private.guard_dispatch_driver_review_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF current_setting('app.dispatch_driver_review', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.runner_accept_status::text = 'ACCEPTED'
    AND NEW.runner_accept_status IS DISTINCT FROM OLD.runner_accept_status
  THEN
    RAISE EXCEPTION 'Driver results must be accepted from Dispatch > Drivers'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.runner_review_status::text = 'REVIEWED'
    AND NEW.runner_review_status IS DISTINCT FROM OLD.runner_review_status
  THEN
    RAISE EXCEPTION 'Driver results must be reviewed from Dispatch > Drivers'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.runner_final_outcome IS NOT NULL
    AND NEW.runner_final_outcome IS DISTINCT FROM OLD.runner_final_outcome
  THEN
    RAISE EXCEPTION 'Driver outcomes must be finalized from Dispatch > Drivers'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.runner_status::text IN ('DELIVERED', 'FAILED_DELIVERY')
    AND NEW.runner_status IS DISTINCT FROM OLD.runner_status
    AND (
      (
        OLD.driver_id IS NOT NULL
        AND OLD.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
      )
      OR (
        NEW.driver_id IS NOT NULL
        AND NEW.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
      )
    )
  THEN
    RAISE EXCEPTION 'Driver results must be accepted from Dispatch > Drivers'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
