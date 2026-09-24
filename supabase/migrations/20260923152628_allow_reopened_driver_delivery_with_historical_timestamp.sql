-- A reopened READY order may retain a delivered_at from a previous cycle.
-- Only a newer, active Driver assignment may submit against that history.
-- Keep all terminal-state, ownership, review and duplicate-result checks.
DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.submit_driver_delivery_result(uuid,text,text,numeric,text,text,date,uuid,jsonb,text)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_old text := '    OR v_order.delivered_at IS NOT NULL';
  v_new text := $guard$    OR (
      v_order.delivered_at IS NOT NULL
      AND NOT COALESCE(
        v_order.status::text = 'READY'
        AND v_order.current_operational_state::text = 'READY'
        AND v_order.runner_status::text IN ('ASSIGNED', 'TAKEN')
        AND v_order.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY', 'DRIVER_FAILED')
        AND v_order.driver_assigned_at > v_order.delivered_at,
        false
      )
    )$guard$;
BEGIN
  IF strpos(v_definition, v_new) > 0 THEN
    RETURN;
  END IF;
  IF strpos(v_definition, v_old) = 0
    OR (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1
  THEN
    RAISE EXCEPTION 'Expected unique Driver historical delivery guard was not found';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;

NOTIFY pgrst, 'reload schema';
