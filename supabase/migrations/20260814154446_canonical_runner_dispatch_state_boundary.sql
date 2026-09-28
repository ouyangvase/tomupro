-- Runner dispatch is allowed only for orders whose authoritative lifecycle
-- state is READY. Legacy status/runner_status fields are retained for history,
-- but they must not re-open an ACTION_REQUIRED order in the dispatch queue.

DO $$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  -- Area, locality, and area-order lookup are read boundaries for the Runner
  -- dispatch UI. The date-scoped branch must use the same canonical boundary
  -- as the active-queue branch.
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_runner_dispatch_area_summary(date)'::regprocedure,
    'public.get_runner_dispatch_locality_summary(date,text)'::regprocedure,
    'public.get_runner_dispatch_area_order_ids(date,text,boolean)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    v_rewritten := replace(
      v_definition,
      E'FROM public.orders o\n    WHERE (',
      E'FROM public.orders o\n    WHERE o.current_operational_state = ''READY''\n      AND ('
    );

    IF v_rewritten <> v_definition THEN
      EXECUTE v_rewritten;
    ELSIF strpos(v_definition, 'current_operational_state') = 0 THEN
      RAISE EXCEPTION 'Expected dispatch scope predicate was not found in %', v_signature;
    END IF;
  END LOOP;

  -- Pickup demand must match the same queue; otherwise an Action Required
  -- order can inflate Driver stock requirements after it leaves dispatch.
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_runner_driver_pickup_shortages(uuid,uuid)'::regprocedure,
    'public.get_runner_driver_pickup_source_orders(uuid,uuid)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    v_rewritten := replace(
      v_definition,
      E'    WHERE public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)',
      E'    WHERE o.current_operational_state = ''READY''\n      AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)'
    );

    IF v_rewritten = v_definition THEN
      v_rewritten := replace(
        v_definition,
        E'      AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)',
        E'      AND o.current_operational_state = ''READY''\n      AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)'
      );
    END IF;

    IF v_rewritten <> v_definition THEN
      EXECUTE v_rewritten;
    ELSIF strpos(v_definition, 'current_operational_state') = 0 THEN
      RAISE EXCEPTION 'Expected pickup scope predicate was not found in %', v_signature;
    END IF;
  END LOOP;

  -- All mutating Runner dispatch RPCs reject stale UI selections at the
  -- selection boundary. This prevents assigning, notifying, or sending an
  -- Action Required order to Needs Review after a concurrent state change.
  SELECT pg_get_functiondef('public.apply_driver_assignment_batch(uuid[],uuid,date,text)'::regprocedure)
    INTO v_definition;
  v_rewritten := replace(
    v_definition,
    E'WHERE o.id = ANY(p_order_ids)\n    FOR UPDATE',
    E'WHERE o.id = ANY(p_order_ids)\n      AND o.current_operational_state = ''READY''\n    FOR UPDATE'
  );
  IF v_rewritten <> v_definition THEN
    EXECUTE v_rewritten;
  ELSIF strpos(v_definition, 'current_operational_state') = 0 THEN
    RAISE EXCEPTION 'Expected assignment selection predicate was not found';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.remove_driver_assignment_batch(uuid[],date)'::regprocedure,
    'public.notify_driver_selected_orders(uuid[],date)'::regprocedure,
    'public.send_orders_to_needs_review(uuid[],date)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    v_rewritten := replace(
      v_definition,
      E'WHERE id = ANY(p_order_ids)\n      AND (',
      E'WHERE id = ANY(p_order_ids)\n      AND current_operational_state = ''READY''\n      AND ('
    );

    IF v_rewritten <> v_definition THEN
      EXECUTE v_rewritten;
    ELSIF strpos(v_definition, 'current_operational_state') = 0 THEN
      RAISE EXCEPTION 'Expected selected-order predicate was not found in %', v_signature;
    END IF;
  END LOOP;

  -- Keep the bulk Driver release re-check safe if the order leaves READY
  -- between candidate collection and the locked update.
  SELECT pg_get_functiondef('public.bulk_unassign_runner_driver_orders(uuid[],date)'::regprocedure)
    INTO v_definition;
  v_rewritten := replace(
    v_definition,
    E'WHERE o.id = ANY(v_candidate_ids)\n    AND o.runner_id = ANY(v_runner_ids)',
    E'WHERE o.id = ANY(v_candidate_ids)\n    AND o.current_operational_state = ''READY''\n    AND o.runner_id = ANY(v_runner_ids)'
  );
  IF v_rewritten <> v_definition THEN
    EXECUTE v_rewritten;
  ELSIF strpos(v_definition, 'current_operational_state') = 0 THEN
    RAISE EXCEPTION 'Expected bulk release re-check predicate was not found';
  END IF;
END;
$$;

-- Dashboard and badge summaries are read boundaries too. Keep their legacy
-- status comparisons aligned with the same authoritative lifecycle state so
-- stale legacy fields cannot make an Action Required order look Ready.
DO $$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_dashboard_stats_manager(uuid[])'::regprocedure,
    'public.get_dashboard_stats_runner(uuid)'::regprocedure,
    'public.get_dashboard_stats_salesperson(uuid)'::regprocedure,
    'public.get_dashboard_stats()'::regprocedure,
    'public.get_sidebar_badges(uuid,text,uuid[])'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    v_rewritten := v_definition;

    v_rewritten := replace(v_rewritten,
      E'status = ''BOOKING''',
      E'current_operational_state = ''BOOKING''');
    v_rewritten := replace(v_rewritten,
      E'status = ''READY''',
      E'current_operational_state = ''READY''');
    v_rewritten := replace(v_rewritten,
      E'status = ''CANCELLED''',
      E'current_operational_state = ''CANCELLED''');
    v_rewritten := replace(v_rewritten,
      E'status != ''CANCELLED''',
      E'current_operational_state != ''CANCELLED''');
    v_rewritten := replace(v_rewritten,
      E'status IN (''BOOKING'', ''READY'')',
      E'current_operational_state IN (''BOOKING'', ''READY'')');

    v_rewritten := replace(v_rewritten,
      E'o.status = ''BOOKING''',
      E'o.current_operational_state = ''BOOKING''');
    v_rewritten := replace(v_rewritten,
      E'o.status = ''READY''',
      E'o.current_operational_state = ''READY''');
    v_rewritten := replace(v_rewritten,
      E'o.status = ''CANCELLED''',
      E'o.current_operational_state = ''CANCELLED''');
    v_rewritten := replace(v_rewritten,
      E'o.status != ''CANCELLED''',
      E'o.current_operational_state != ''CANCELLED''');
    v_rewritten := replace(v_rewritten,
      E'o.status IN (''BOOKING'', ''READY'')',
      E'o.current_operational_state IN (''BOOKING'', ''READY'')');

    IF v_rewritten <> v_definition THEN
      EXECUTE v_rewritten;
    ELSIF strpos(v_definition, 'current_operational_state') = 0 THEN
      RAISE EXCEPTION 'Expected dashboard lifecycle predicate was not found in %', v_signature;
    END IF;
  END LOOP;
END;
$$;

-- Defense in depth for direct/RPC writes: assigning an active Driver to an
-- Action Required/Delivered/Cancelled order is never a valid transition.
CREATE OR REPLACE FUNCTION private.guard_driver_assignment_lifecycle_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL
    AND NEW.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
    AND NEW.current_operational_state <> 'READY'
  THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Driver assignment requires canonical READY state for order %', NEW.id
        USING ERRCODE = '22023';
    ELSIF NEW.driver_id IS DISTINCT FROM OLD.driver_id
      OR NEW.driver_status IS DISTINCT FROM OLD.driver_status
      OR NEW.current_operational_state IS DISTINCT FROM OLD.current_operational_state
    THEN
      RAISE EXCEPTION 'Driver assignment requires canonical READY state for order %', NEW.id
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_driver_assignment_lifecycle_state ON public.orders;
CREATE TRIGGER guard_driver_assignment_lifecycle_state
BEFORE INSERT OR UPDATE OF driver_id, driver_status, status, operational_status,
  runner_status, runner_review_status, runner_final_outcome,
  salesperson_action_required ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.guard_driver_assignment_lifecycle_state();

NOTIFY pgrst, 'reload schema';
