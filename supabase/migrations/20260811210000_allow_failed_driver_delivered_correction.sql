BEGIN;

-- Failed delivery corrections must use the canonical Driver RPC.  The RPC
-- already validates assignment, pickup, and Runner-final locks; this migration
-- only removes the contradictory guard that rejected the supported
-- failed -> delivered correction path.
DO $migration$
DECLARE
  v_definition text;
  v_old_block text := $old$
  IF v_submission_mode = 'CORRECTION'
    AND v_result_type = 'DRIVER_DELIVERED_SUBMITTED'
  THEN
    RAISE EXCEPTION 'A failed-result correction must remain a failed result';
  END IF;
$old$;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'submit_driver_delivery_result'
    AND p.pronargs = 10;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'submit_driver_delivery_result(uuid, text, ...) was not found';
  END IF;

  IF position(v_old_block IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected failed-result correction guard was not found';
  END IF;

  EXECUTE replace(v_definition, v_old_block, '');
END;
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
