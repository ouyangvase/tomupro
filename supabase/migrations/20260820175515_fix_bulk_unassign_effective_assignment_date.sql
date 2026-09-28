-- The candidate list is scoped by the canonical effective assignment date.
-- Recheck the same date after locking; order_operational_date is historical
-- for Delivery Tomorrow orders and can incorrectly reject the assignment.
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
    $needle$  SELECT COALESCE(array_agg(o.id ORDER BY o.id), ARRAY[]::uuid[])
  INTO v_revert_ids
  FROM public.orders o
  WHERE o.id = ANY(v_candidate_ids)$needle$,
    $replacement$  SELECT COALESCE(array_agg(o.id ORDER BY o.id), ARRAY[]::uuid[])
  INTO v_revert_ids
  FROM public.orders o
  LEFT JOIN public.driver_assignment_batches batch
    ON batch.id = o.driver_assignment_batch_id
  LEFT JOIN LATERAL (
    SELECT audit.created_at
    FROM public.audit_logs audit
    WHERE audit.entity_type = 'order'
      AND audit.entity_id = o.id
      AND audit.action IN ('DRIVER_ASSIGNED', 'DRIVER_REASSIGNED', 'ORDER_ASSIGNED_TO_DRIVER')
    ORDER BY audit.created_at DESC, audit.id DESC
    LIMIT 1
  ) assignment_audit ON true
  WHERE o.id = ANY(v_candidate_ids)$replacement$
  );

  IF v_rewritten = v_definition THEN
    IF strpos(v_definition, 'private.driver_analytics_assignment_date') > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Expected bulk unassign candidate recheck query was not found';
  END IF;

  v_rewritten := replace(
    v_rewritten,
    $needle$    AND (
      p_operational_date IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date
    );$needle$,
    $replacement$    AND (
      p_operational_date IS NULL
      OR COALESCE(
        private.driver_analytics_assignment_date(
          o.driver_assigned_at,
          batch.created_at,
          assignment_audit.created_at
        ),
        public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
      ) = p_operational_date
    );$replacement$
  );

  IF strpos(v_rewritten, 'private.driver_analytics_assignment_date') = 0 THEN
    RAISE EXCEPTION 'Expected effective assignment date predicate was not found';
  END IF;

  EXECUTE v_rewritten;
END;
$$;

NOTIFY pgrst, 'reload schema';
