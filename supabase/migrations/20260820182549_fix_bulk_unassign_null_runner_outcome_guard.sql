-- Treat a missing final outcome as not requiring salesperson follow-up.
-- PostgreSQL's NOT (true AND NULL) evaluates to NULL and filters the row.
DO $$
DECLARE
  v_signature regprocedure := 'public.bulk_unassign_runner_driver_orders(uuid[],date)'::regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  v_rewritten := replace(
    v_definition,
    $needle$    AND NOT (o.runner_review_status::text = 'REVIEWED' AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP')$needle$,
    $replacement$    AND NOT (
      o.runner_review_status::text = 'REVIEWED'
      AND COALESCE(o.runner_final_outcome::text, '') = 'NEED_SALESPERSON_FOLLOWUP'
    )$replacement$
  );

  IF v_rewritten = v_definition THEN
    IF strpos(v_definition, 'COALESCE(o.runner_final_outcome::text, '''')') > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Expected runner outcome guard was not found';
  END IF;

  EXECUTE v_rewritten;
END;
$$;

NOTIFY pgrst, 'reload schema';
