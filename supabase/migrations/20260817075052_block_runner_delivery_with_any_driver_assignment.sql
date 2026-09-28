-- A Runner delivery must never consume a current Driver assignment. The
-- existing fast RPC only rejected submitted Driver outcomes; this expands
-- the boundary to every active assignment state.
DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.mark_order_delivered_fast(uuid,uuid)'::regprocedure;
  v_definition text;
  v_assignment_check constant text := $old$IF v_order.driver_id IS NOT NULL
    AND v_order.driver_status IN ('DRIVER_DELIVERED', 'DRIVER_FAILED') THEN$old$;
  v_assignment_check_replacement constant text := $new$IF v_order.driver_id IS NOT NULL THEN$new$;
  v_error constant text := 'Driver results must be reviewed from Dispatch > Drivers';
  v_replacement constant text := 'Runner delivery is blocked while a Driver is assigned. Review it from Dispatch > Drivers or release the assignment first';
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, v_assignment_check) > 0 THEN
    v_definition := replace(v_definition, v_assignment_check, v_assignment_check_replacement);
  ELSIF strpos(v_definition, v_assignment_check_replacement) = 0 THEN
    RAISE EXCEPTION 'mark_order_delivered_fast Driver assignment guard was not found';
  END IF;

  v_definition := replace(v_definition, v_error, v_replacement);
  EXECUTE v_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
