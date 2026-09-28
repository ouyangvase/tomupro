-- Keep the bulk Runner "Return all to Unassigned" operation aligned with the
-- canonical Driver assignment source. Delivery Tomorrow is intentionally kept
-- in READY after Runner acceptance, but its preserved driver outcome uses
-- DRIVER_FAILED instead of the normal ASSIGNED/OUT_FOR_DELIVERY value.
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
    $needle$    AND o.driver_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')$needle$,
    $replacement$    AND (
      o.driver_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
      OR (
        o.current_operational_state = 'READY'
        AND o.driver_status::text = 'DRIVER_FAILED'
        AND o.runner_status::text IN ('ASSIGNED', 'TAKEN')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') = 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') = 'REVIEWED'
        AND lower(regexp_replace(
          trim(COALESCE(o.driver_failed_reason::text, '')),
          '\s+',
          ' ',
          'g'
        )) = 'delivery tomorrow'
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_final_outcome::text, '') NOT IN (
          'NEED_SALESPERSON_FOLLOWUP',
          'DELIVERED',
          'FAILED_DELIVERY'
        )
      )
    )$replacement$
  );

  IF v_rewritten = v_definition THEN
    IF strpos(v_definition, 'delivery tomorrow') > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Expected Driver assignment status predicate was not found';
  END IF;

  EXECUTE v_rewritten;
END;
$$;

NOTIFY pgrst, 'reload schema';
