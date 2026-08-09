-- Return every currently active Driver App assignment in the selected Runner
-- scope to the existing Unassigned queue in one atomic transaction.

CREATE OR REPLACE FUNCTION public.bulk_unassign_runner_driver_orders(
  p_runner_ids uuid[],
  p_operational_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text := public.get_user_role(v_actor_id)::text;
  v_business_date date := COALESCE(
    p_operational_date,
    (now() AT TIME ZONE 'Asia/Brunei')::date
  );
  v_runner_ids uuid[];
  v_candidate_ids uuid[];
  v_revert_ids uuid[];
  v_driver_ids uuid[];
  v_expected_count integer := 0;
  v_reverted_count integer := 0;
  v_skipped_count integer := 0;
  v_collect_amount numeric(12,2) := 0;
  v_batch_id uuid;
  v_before_assignments jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT requested.runner_id ORDER BY requested.runner_id), ARRAY[]::uuid[])
  INTO v_runner_ids
  FROM unnest(COALESCE(p_runner_ids, ARRAY[]::uuid[])) AS requested(runner_id)
  WHERE requested.runner_id IS NOT NULL;

  IF cardinality(v_runner_ids) = 0 THEN
    RAISE EXCEPTION 'At least one Runner scope is required';
  END IF;

  IF v_actor_role <> 'admin'
    AND EXISTS (
      SELECT 1
      FROM unnest(v_runner_ids) AS requested(runner_id)
      WHERE NOT (
        (v_actor_role = 'runner' AND requested.runner_id = v_actor_id)
        OR public.has_runner_assistant_permission(v_actor_id, requested.runner_id, 'driver_inbox')
      )
    )
  THEN
    RAISE EXCEPTION 'You do not have permission to unassign Driver orders in this Runner scope';
  END IF;

  -- Use the same canonical active source as the Driver App. This excludes
  -- delivered/failed review rows, cancelled history, and completed rows.
  SELECT COALESCE(array_agg(DISTINCT source.order_id ORDER BY source.order_id), ARRAY[]::uuid[])
  INTO v_candidate_ids
  FROM unnest(v_runner_ids) AS requested(runner_id)
  CROSS JOIN LATERAL public.get_driver_assignment_source(
    requested.runner_id,
    NULL,
    p_operational_date,
    p_operational_date,
    true,
    false
  ) AS source;

  v_expected_count := cardinality(v_candidate_ids);

  IF v_expected_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'batch_id', NULL,
      'runner_ids', v_runner_ids,
      'expected_count', 0,
      'reverted_count', 0,
      'skipped_count', 0,
      'reverted_collect_amount', 0,
      'reverted_order_ids', ARRAY[]::uuid[],
      'affected_driver_ids', ARRAY[]::uuid[]
    );
  END IF;

  -- Lock the source snapshot, then re-check the canonical state after the
  -- lock so an order completing concurrently can never be reset.
  PERFORM o.id
  FROM public.orders o
  WHERE o.id = ANY(v_candidate_ids)
  ORDER BY o.id
  FOR UPDATE;

  SELECT COALESCE(array_agg(o.id ORDER BY o.id), ARRAY[]::uuid[])
  INTO v_revert_ids
  FROM public.orders o
  WHERE o.id = ANY(v_candidate_ids)
    AND o.runner_id = ANY(v_runner_ids)
    AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
    AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
    AND COALESCE(o.operational_status::text, '') NOT IN (
      'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
    )
    AND NOT (
      o.runner_review_status::text = 'REVIEWED'
      AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
    )
    AND (
      p_operational_date IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date
    );

  v_reverted_count := cardinality(v_revert_ids);
  v_skipped_count := v_expected_count - v_reverted_count;

  IF v_reverted_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'batch_id', NULL,
      'runner_ids', v_runner_ids,
      'expected_count', v_expected_count,
      'reverted_count', 0,
      'skipped_count', v_skipped_count,
      'reverted_collect_amount', 0,
      'reverted_order_ids', ARRAY[]::uuid[],
      'affected_driver_ids', ARRAY[]::uuid[]
    );
  END IF;

  SELECT
    COALESCE(SUM(public.order_collection_amount(o.payment_method::text, o.total_amount)), 0)::numeric,
    COALESCE(array_agg(DISTINCT o.driver_id ORDER BY o.driver_id), ARRAY[]::uuid[]),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'order_id', o.id,
        'order_code', o.order_code,
        'runner_id', o.runner_id,
        'driver_id', o.driver_id,
        'driver_status', o.driver_status,
        'driver_assignment_batch_id', o.driver_assignment_batch_id,
        'driver_assigned_at', o.driver_assigned_at,
        'driver_assigned_by', o.driver_assigned_by
      )
      ORDER BY o.order_code, o.id
    ), '[]'::jsonb)
  INTO v_collect_amount, v_driver_ids, v_before_assignments
  FROM public.orders o
  WHERE o.id = ANY(v_revert_ids);

  INSERT INTO public.driver_assignment_batches (
    operational_date,
    action,
    selected_order_count,
    selected_collect_amount,
    old_driver_id,
    new_driver_id,
    created_by,
    result_summary
  )
  VALUES (
    v_business_date,
    'UNASSIGN',
    v_reverted_count,
    v_collect_amount,
    NULL,
    NULL,
    v_actor_id,
    jsonb_build_object(
      'status', 'applied',
      'source', 'DRIVER_INBOX',
      'reason', 'Manual bulk return of active Driver orders',
      'runner_ids', v_runner_ids,
      'affected_driver_ids', v_driver_ids,
      'expected_count', v_expected_count,
      'reverted_count', v_reverted_count,
      'skipped_count', v_skipped_count,
      'previous_assignments', v_before_assignments,
      'resulting_state', 'UNASSIGNED'
    )
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  SELECT
    'order',
    o.id,
    'DRIVER_ASSIGNMENT_REVERTED',
    v_actor_id,
    jsonb_build_object(
      'runner_id', o.runner_id,
      'driver_id', o.driver_id,
      'driver_status', o.driver_status,
      'driver_assignment_batch_id', o.driver_assignment_batch_id,
      'driver_assigned_at', o.driver_assigned_at,
      'driver_assigned_by', o.driver_assigned_by
    ),
    jsonb_build_object(
      'driver_id', NULL,
      'driver_status', 'UNASSIGNED',
      'driver_assignment_batch_id', v_batch_id,
      'reason', 'Manual bulk return of active Driver orders'
    )
  FROM public.orders o
  WHERE o.id = ANY(v_revert_ids);

  UPDATE public.orders
  SET driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_assignment_batch_id = v_batch_id,
      driver_assigned_at = NULL,
      driver_assigned_by = NULL,
      updated_at = now()
  WHERE id = ANY(v_revert_ids);

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'driver_assignment_batch',
    v_batch_id,
    'BULK_UNASSIGN_RUNNER_DRIVER_ORDERS',
    v_actor_id,
    jsonb_build_object(
      'assignments', v_before_assignments,
      'runner_ids', v_runner_ids,
      'expected_order_count', v_expected_count
    ),
    jsonb_build_object(
      'runner_ids', v_runner_ids,
      'affected_driver_ids', v_driver_ids,
      'order_count', v_reverted_count,
      'affected_order_ids', v_revert_ids,
      'skipped_count', v_skipped_count,
      'performed_by', v_actor_id,
      'performed_at', now(),
      'reason', 'Manual bulk return of active Driver orders',
      'resulting_state', 'UNASSIGNED'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'runner_ids', v_runner_ids,
    'expected_count', v_expected_count,
    'reverted_count', v_reverted_count,
    'skipped_count', v_skipped_count,
    'reverted_collect_amount', v_collect_amount,
    'reverted_order_ids', v_revert_ids,
    'affected_driver_ids', v_driver_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_unassign_runner_driver_orders(uuid[], date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_unassign_runner_driver_orders(uuid[], date)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_unassign_runner_driver_orders(uuid[], date) IS
  'Atomically returns all canonical active Driver App assignments in the authorized Runner scope to Unassigned.';

NOTIFY pgrst, 'reload schema';
