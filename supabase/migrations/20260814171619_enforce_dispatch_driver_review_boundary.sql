-- Driver results are evidence until a Runner explicitly reviews them from
-- Dispatch > Drivers. A direct orders UPDATE must not be able to create a
-- reviewed/final Driver outcome or mark the delivery accepted.
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
      OLD.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
      OR NEW.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
    )
  THEN
    RAISE EXCEPTION 'Driver results must be accepted from Dispatch > Drivers'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_dispatch_driver_review_boundary ON public.orders;
CREATE TRIGGER guard_dispatch_driver_review_boundary
BEFORE UPDATE OF runner_accept_status, runner_status, runner_review_status,
  runner_final_outcome ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.guard_dispatch_driver_review_boundary();

REVOKE ALL ON FUNCTION private.guard_dispatch_driver_review_boundary() FROM PUBLIC;

-- Mark the canonical RPC transaction as the trusted Dispatch > Drivers
-- acceptance path. The local setting is visible to the orders trigger only
-- during this RPC transaction.
DO $migration$
DECLARE
  v_definition text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure
  ) INTO v_definition;

  v_anchor := E'BEGIN\n  IF p_actor_id IS DISTINCT FROM auth.uid() THEN';
  v_replacement := E'BEGIN\n  PERFORM set_config(''app.dispatch_driver_review'', ''true'', true);\n\n  IF p_actor_id IS DISTINCT FROM auth.uid() THEN';

  IF strpos(v_definition, v_anchor) = 0 THEN
    RAISE EXCEPTION 'review_driver_delivery declaration no longer matches expected acceptance boundary';
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_replacement);
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(
    'public.schedule_driver_failed_orders_for_tomorrow(uuid[],uuid,uuid)'::regprocedure
  ) INTO v_definition;

  v_anchor := E'BEGIN\n  IF p_actor_id IS DISTINCT FROM v_actor THEN';
  v_replacement := E'BEGIN\n  PERFORM set_config(''app.dispatch_driver_review'', ''true'', true);\n\n  IF p_actor_id IS DISTINCT FROM v_actor THEN';

  IF strpos(v_definition, v_anchor) = 0 THEN
    RAISE EXCEPTION 'schedule_driver_failed_orders_for_tomorrow declaration no longer matches expected acceptance boundary';
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_replacement);
END;
$migration$;

NOTIFY pgrst, 'reload schema';
