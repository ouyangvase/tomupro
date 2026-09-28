-- The auto-reschedule RPC is present, but its CASE expression is inferred as
-- text when assigning to the runner_status enum column. Patch only that
-- expression; no other lifecycle function or transition is changed.

BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.set_order_auto_reschedule(uuid,date,uuid,text,text)'::regprocedure;
  v_definition text;
  v_original_definition text;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;
  v_original_definition := v_definition;

  IF strpos(v_definition, '::runner_status') > 0 THEN
    RETURN;
  END IF;

  v_definition := regexp_replace(
    v_definition,
    $pattern$runner_status[[:space:]]*=[[:space:]]*CASE[[:space:]]+WHEN[[:space:]]+p_runner_id[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN[[:space:]]+'UNASSIGNED'[[:space:]]+ELSE[[:space:]]+'ASSIGNED'[[:space:]]+END$pattern$,
    $replacement$runner_status = CASE WHEN p_runner_id IS NULL THEN 'UNASSIGNED'::runner_status ELSE 'ASSIGNED'::runner_status END$replacement$,
    'g'
  );

  IF v_definition = v_original_definition THEN
    RAISE EXCEPTION 'set_order_auto_reschedule runner_status expression no longer matches expected definition';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
