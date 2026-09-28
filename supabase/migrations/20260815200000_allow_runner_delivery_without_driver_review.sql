-- The final-lifecycle trigger automatically marks normal Runner deliveries as
-- REVIEWED. That is not Driver review when there is no current driver.
DO $$
DECLARE
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(
    'private.guard_dispatch_driver_review_boundary()'::regprocedure
  ) INTO v_definition;

  v_rewritten := replace(
    v_definition,
    E'IF NEW.runner_review_status::text = ''REVIEWED''\n'
      || E'    AND NEW.runner_review_status IS DISTINCT FROM OLD.runner_review_status',
    E'IF NEW.runner_review_status::text = ''REVIEWED''\n'
      || E'    AND NEW.runner_review_status IS DISTINCT FROM OLD.runner_review_status\n'
      || E'    AND (OLD.driver_id IS NOT NULL OR NEW.driver_id IS NOT NULL)'
  );

  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Runner delivery review guard was not found';
  END IF;

  EXECUTE v_rewritten;
END;
$$;

NOTIFY pgrst, 'reload schema';
