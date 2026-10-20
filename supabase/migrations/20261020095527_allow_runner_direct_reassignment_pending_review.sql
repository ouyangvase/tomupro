-- A pending Driver result blocks a new assignment, but it must not block an
-- explicit Runner reassignment.  The reassignment RPC already records the old
-- Driver, clears the old delivery result atomically, and notifies both sides.
-- Keep the review guard for ASSIGN and only relax it for REASSIGN.
DO $$
DECLARE
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(
    'public.apply_driver_assignment_batch(uuid[],uuid,date,text)'::regprocedure
  ) INTO v_definition;

  v_rewritten := replace(
    v_definition,
    'IF v_pending_review_count > 0 THEN',
    'IF v_pending_review_count > 0 AND v_action <> ''REASSIGN'' THEN'
  );

  IF v_rewritten = v_definition THEN
    RAISE EXCEPTION 'Pending Driver review assignment guard was not found';
  END IF;

  EXECUTE v_rewritten;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text) IS
  'Assigns or reassigns orders in the Runner scope. Pending Driver results block new assignment but an explicit reassignment clears the old result atomically, records the old Driver, and notifies the affected Drivers.';

NOTIFY pgrst, 'reload schema';
