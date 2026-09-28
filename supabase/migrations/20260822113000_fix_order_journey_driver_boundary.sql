-- Driver submissions are reference evidence. The order location changes only
-- when the Runner accepts or rejects the Driver result.
-- This migration only updates the read-only Journey projection.

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.get_order_journey(text[],date,date,timestamptz)'::regprocedure;
  v_definition text;
  v_driver_location text := E'public.order_journey_event_location(\n                NULL, NULL, NULL, da.result_type, da.runner_decision, da.failure_reason\n              ) AS order_location,';
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, v_driver_location) = 0 THEN
    RETURN;
  END IF;

  v_definition := replace(
    v_definition,
    v_driver_location,
    'NULL::text AS order_location,'
  );

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
