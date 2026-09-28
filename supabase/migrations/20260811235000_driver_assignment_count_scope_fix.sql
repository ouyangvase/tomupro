-- Keep Driver assignment counts and bulk release on the canonical active source.

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_area_summary(p_operational_date date)
RETURNS TABLE(
  area_code text,
  area_name text,
  district text,
  is_special boolean,
  total_orders integer,
  assigned_orders integer,
  unassigned_orders integer,
  assignment_percentage numeric,
  total_collect_amount numeric,
  assigned_collect_amount numeric,
  unassigned_collect_amount numeric,
  needs_review_orders integer,
  active_driver_count integer,
  driver_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH scoped AS (
    SELECT
      o.*,
      COALESCE(o.delivery_area_code, public.classify_delivery_area(o.address, o.status::text)->>'delivery_area') AS resolved_area_code,
      public.order_collection_amount(o.payment_method::text, o.total_amount) AS collect_amount
    FROM public.orders o
    WHERE (
        (p_operational_date IS NULL AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text))
        OR (p_operational_date IS NOT NULL AND public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date)
      )
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (public.get_user_role(auth.uid())::text = 'runner' AND o.runner_id = auth.uid())
      )
  ),
  active_assignments AS (
    SELECT source.order_id, source.driver_id, source.driver_name
    FROM public.get_driver_assignment_source(NULL, NULL, NULL, NULL, true, false) AS source
    WHERE source.is_active_assignment
      AND (
        p_operational_date IS NULL
        OR source.operational_date = p_operational_date
      )
  ),
  area_rows AS (
    SELECT
      da.code,
      da.name,
      da.district,
      da.is_special,
      da.display_order,
      s.id,
      s.driver_id AS raw_driver_id,
      s.driver_status AS raw_driver_status,
      active.driver_id,
      active.driver_name,
      s.collect_amount
    FROM public.delivery_areas da
    LEFT JOIN scoped s ON s.resolved_area_code = da.code
    LEFT JOIN active_assignments active ON active.order_id = s.id
    WHERE da.active = true
  )
  SELECT
    code AS area_code,
    name AS area_name,
    district,
    is_special,
    COUNT(id)::integer AS total_orders,
    CASE WHEN is_special THEN 0 ELSE COUNT(id) FILTER (WHERE driver_id IS NOT NULL)::integer END AS assigned_orders,
    CASE WHEN is_special THEN 0 ELSE COUNT(id) FILTER (
      WHERE raw_driver_id IS NULL OR COALESCE(raw_driver_status, 'UNASSIGNED') = 'UNASSIGNED'
    )::integer END AS unassigned_orders,
    CASE
      WHEN is_special OR COUNT(id) = 0 THEN 0
      ELSE ROUND((COUNT(id) FILTER (WHERE driver_id IS NOT NULL)::numeric / COUNT(id)::numeric) * 100, 1)
    END AS assignment_percentage,
    COALESCE(SUM(collect_amount), 0)::numeric AS total_collect_amount,
    CASE WHEN is_special THEN 0 ELSE COALESCE(SUM(collect_amount) FILTER (WHERE driver_id IS NOT NULL), 0)::numeric END AS assigned_collect_amount,
    CASE WHEN is_special THEN 0 ELSE COALESCE(SUM(collect_amount) FILTER (
      WHERE raw_driver_id IS NULL OR COALESCE(raw_driver_status, 'UNASSIGNED') = 'UNASSIGNED'
    ), 0)::numeric END AS unassigned_collect_amount,
    COUNT(id) FILTER (WHERE code = 'NEEDS_REVIEW')::integer AS needs_review_orders,
    COUNT(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL)::integer AS active_driver_count,
    COALESCE(array_remove(array_agg(DISTINCT driver_name), NULL), ARRAY[]::text[]) AS driver_names
  FROM area_rows
  GROUP BY code, name, district, is_special, display_order
  ORDER BY display_order, code;
$function$;

REVOKE ALL ON FUNCTION public.get_runner_dispatch_area_summary(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_dispatch_area_summary(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_driver_workloads(p_operational_date date)
RETURNS TABLE(
  driver_id uuid,
  driver_name text,
  is_available boolean,
  assigned_order_count integer,
  collect_amount numeric,
  area_codes text[],
  area_names text[],
  capacity integer,
  remaining_capacity integer,
  notification_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH actor_context AS (
    SELECT public.get_user_role(auth.uid())::text AS role
  ),
  actor_runner_scopes AS (
    SELECT auth.uid() AS runner_id
    FROM actor_context
    WHERE role = 'runner'

    UNION

    SELECT ra.runner_id
    FROM public.runner_assistants ra
    WHERE ra.assistant_id = auth.uid()
      AND ra.is_active = true
      AND (
        ra.can_manage_driver_inbox = true
        OR ra.can_manage_driver_stock = true
        OR ra.can_view_driver_workload = true
      )
  ),
  assignments AS (
    SELECT source.*
    FROM actor_context context
    CROSS JOIN LATERAL public.get_driver_assignment_source(NULL, NULL, NULL, p_operational_date, true, false) source
    WHERE context.role = 'admin'
      AND source.is_active_assignment

    UNION ALL

    SELECT source.*
    FROM actor_context context
    CROSS JOIN actor_runner_scopes scope
    CROSS JOIN LATERAL public.get_driver_assignment_source(scope.runner_id, NULL, NULL, p_operational_date, true, false) source
    WHERE context.role <> 'admin'
      AND source.is_active_assignment
  ),
  linked_drivers AS (
    SELECT
      rd.driver_id,
      COALESCE(p.display_name, p.email, 'Unknown Driver')::text AS driver_name,
      BOOL_OR(COALESCE(p.is_active, true) AND rd.is_active) AS is_available,
      MAX(dap.capacity) AS capacity
    FROM public.runner_drivers rd
    CROSS JOIN actor_context context
    JOIN public.profiles p ON p.id = rd.driver_id
    LEFT JOIN public.driver_area_preferences dap
      ON dap.runner_id = rd.runner_id
      AND dap.driver_id = rd.driver_id
      AND dap.active = true
    WHERE rd.is_active = true
      AND (
        context.role = 'admin'
        OR rd.runner_id IN (SELECT runner_id FROM actor_runner_scopes)
      )
    GROUP BY rd.driver_id, p.display_name, p.email
  ),
  driver_pool AS (
    SELECT linked.driver_id, linked.driver_name, linked.is_available, linked.capacity
    FROM linked_drivers linked
    UNION ALL
    SELECT DISTINCT assignment.driver_id, assignment.driver_name, true, NULL::integer
    FROM assignments assignment
    WHERE NOT EXISTS (
      SELECT 1 FROM linked_drivers linked WHERE linked.driver_id = assignment.driver_id
    )
  )
  SELECT
    pool.driver_id,
    pool.driver_name,
    pool.is_available,
    COUNT(assignments.order_id)::integer,
    COALESCE(SUM(assignments.collect_amount), 0)::numeric,
    COALESCE(array_remove(array_agg(DISTINCT assignments.order_data->>'delivery_area_code'), NULL), ARRAY[]::text[]),
    COALESCE(array_remove(array_agg(DISTINCT COALESCE(assignments.order_data->>'delivery_area_name', assignments.order_data->>'area')), NULL), ARRAY[]::text[]),
    pool.capacity,
    CASE WHEN pool.capacity IS NULL THEN NULL ELSE GREATEST(pool.capacity - COUNT(assignments.order_id)::integer, 0) END,
    'sent'::text
  FROM driver_pool pool
  LEFT JOIN assignments ON assignments.driver_id = pool.driver_id
  GROUP BY pool.driver_id, pool.driver_name, pool.is_available, pool.capacity
  ORDER BY COUNT(assignments.order_id) DESC, pool.driver_name;
$function$;

REVOKE ALL ON FUNCTION public.get_runner_dispatch_driver_workloads(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_dispatch_driver_workloads(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.bulk_unassign_runner_driver_orders(
  p_runner_ids uuid[],
  p_operational_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text := public.get_user_role(v_actor_id)::text;
  v_business_date date := COALESCE(p_operational_date, (now() AT TIME ZONE 'Asia/Brunei')::date);
  v_runner_ids uuid[];
  v_candidate_ids uuid[];
  v_revert_ids uuid[];
  v_skipped_ids uuid[];
  v_driver_ids uuid[];
  v_expected_count integer := 0;
  v_reverted_count integer := 0;
  v_skipped_count integer := 0;
  v_collect_amount numeric(12,2) := 0;
  v_batch_id uuid;
  v_before_assignments jsonb := '[]'::jsonb;
  v_skipped_orders jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(array_agg(DISTINCT requested.runner_id ORDER BY requested.runner_id), ARRAY[]::uuid[])
  INTO v_runner_ids
  FROM unnest(COALESCE(p_runner_ids, ARRAY[]::uuid[])) AS requested(runner_id)
  WHERE requested.runner_id IS NOT NULL;

  IF cardinality(v_runner_ids) = 0 THEN RAISE EXCEPTION 'At least one Runner scope is required'; END IF;

  IF v_actor_role <> 'admin'
    AND EXISTS (
      SELECT 1 FROM unnest(v_runner_ids) AS requested(runner_id)
      WHERE NOT (
        (v_actor_role = 'runner' AND requested.runner_id = v_actor_id)
        OR public.has_runner_assistant_permission(v_actor_id, requested.runner_id, 'driver_inbox')
      )
    )
  THEN
    RAISE EXCEPTION 'You do not have permission to unassign Driver orders in this Runner scope';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT source.order_id ORDER BY source.order_id), ARRAY[]::uuid[])
  INTO v_candidate_ids
  FROM unnest(v_runner_ids) AS requested(runner_id)
  CROSS JOIN LATERAL public.get_driver_assignment_source(
    requested.runner_id, NULL, p_operational_date, p_operational_date, true, false
  ) AS source
  WHERE source.is_active_assignment;

  v_expected_count := cardinality(v_candidate_ids);
  IF v_expected_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'batch_id', NULL, 'runner_ids', v_runner_ids,
      'expected_count', 0, 'reverted_count', 0, 'skipped_count', 0,
      'reverted_order_ids', ARRAY[]::uuid[], 'skipped_order_ids', ARRAY[]::uuid[],
      'skipped_orders', '[]'::jsonb, 'affected_driver_ids', ARRAY[]::uuid[]
    );
  END IF;

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
    AND o.driver_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
    AND COALESCE(o.operational_status, '') NOT IN ('DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND NOT (o.runner_review_status::text = 'REVIEWED' AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP')
    AND (
      p_operational_date IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date
    );

  SELECT
    COALESCE(array_agg(candidate.order_id ORDER BY candidate.order_id), ARRAY[]::uuid[]),
    COALESCE(jsonb_agg(jsonb_build_object(
      'order_id', candidate.order_id,
      'order_code', o.order_code,
      'reason', CASE
        WHEN o.driver_id IS NULL OR o.driver_status NOT IN ('ASSIGNED', 'OUT_FOR_DELIVERY') THEN 'Assignment is no longer active'
        WHEN NOT public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text) THEN 'Order is no longer in the active Runner queue'
        WHEN COALESCE(o.operational_status, '') IN ('DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED') THEN 'Order is finalized'
        ELSE 'Order changed before release'
      END
    ) ORDER BY o.order_code, candidate.order_id), '[]'::jsonb)
  INTO v_skipped_ids, v_skipped_orders
  FROM unnest(v_candidate_ids) AS candidate(order_id)
  JOIN public.orders o ON o.id = candidate.order_id
  WHERE NOT (candidate.order_id = ANY(v_revert_ids));

  v_reverted_count := cardinality(v_revert_ids);
  v_skipped_count := cardinality(v_skipped_ids);

  IF v_reverted_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'batch_id', NULL, 'runner_ids', v_runner_ids,
      'expected_count', v_expected_count, 'reverted_count', 0, 'skipped_count', v_skipped_count,
      'reverted_order_ids', ARRAY[]::uuid[], 'skipped_order_ids', v_skipped_ids,
      'skipped_orders', v_skipped_orders, 'affected_driver_ids', ARRAY[]::uuid[]
    );
  END IF;

  SELECT
    COALESCE(SUM(public.order_collection_amount(o.payment_method::text, o.total_amount)), 0)::numeric,
    COALESCE(array_agg(DISTINCT o.driver_id ORDER BY o.driver_id), ARRAY[]::uuid[]),
    COALESCE(jsonb_agg(jsonb_build_object(
      'order_id', o.id, 'order_code', o.order_code, 'runner_id', o.runner_id,
      'driver_id', o.driver_id, 'driver_status', o.driver_status,
      'driver_assignment_batch_id', o.driver_assignment_batch_id,
      'driver_assigned_at', o.driver_assigned_at
    ) ORDER BY o.order_code, o.id), '[]'::jsonb)
  INTO v_collect_amount, v_driver_ids, v_before_assignments
  FROM public.orders o
  WHERE o.id = ANY(v_revert_ids);

  INSERT INTO public.driver_assignment_batches (
    operational_date, action, selected_order_count, selected_collect_amount,
    old_driver_id, new_driver_id, created_by, result_summary
  )
  VALUES (
    v_business_date, 'UNASSIGN', v_reverted_count, v_collect_amount,
    NULL, NULL, v_actor_id,
    jsonb_build_object(
      'status', 'applied', 'source', 'DRIVER_INBOX',
      'reason', 'Manual bulk return of active Driver orders',
      'runner_ids', v_runner_ids, 'affected_driver_ids', v_driver_ids,
      'expected_count', v_expected_count, 'reverted_count', v_reverted_count,
      'skipped_count', v_skipped_count, 'skipped_orders', v_skipped_orders,
      'previous_assignments', v_before_assignments, 'resulting_state', 'UNASSIGNED'
    )
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  SELECT
    'order', o.id, 'DRIVER_ASSIGNMENT_REVERTED', v_actor_id,
    jsonb_build_object(
      'runner_id', o.runner_id, 'driver_id', o.driver_id, 'driver_status', o.driver_status,
      'driver_assignment_batch_id', o.driver_assignment_batch_id,
      'driver_assigned_at', o.driver_assigned_at, 'driver_assigned_by', o.driver_assigned_by
    ),
    jsonb_build_object('driver_id', NULL, 'driver_status', 'UNASSIGNED', 'driver_assignment_batch_id', v_batch_id, 'reason', 'Manual bulk return of active Driver orders')
  FROM public.orders o
  WHERE o.id = ANY(v_revert_ids);

  UPDATE public.orders
  SET driver_id = NULL, driver_status = 'UNASSIGNED', driver_assignment_batch_id = v_batch_id,
      driver_assigned_at = NULL, driver_assigned_by = NULL, updated_at = now()
  WHERE id = ANY(v_revert_ids);

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, before_json, after_json)
  VALUES (
    'driver_assignment_batch', v_batch_id, 'BULK_UNASSIGN_RUNNER_DRIVER_ORDERS', v_actor_id,
    jsonb_build_object('assignments', v_before_assignments, 'runner_ids', v_runner_ids, 'expected_order_count', v_expected_count),
    jsonb_build_object(
      'runner_ids', v_runner_ids, 'affected_driver_ids', v_driver_ids,
      'order_count', v_reverted_count, 'affected_order_ids', v_revert_ids,
      'skipped_count', v_skipped_count, 'skipped_orders', v_skipped_orders,
      'performed_by', v_actor_id, 'performed_at', now(),
      'reason', 'Manual bulk return of active Driver orders', 'resulting_state', 'UNASSIGNED'
    )
  );

  RETURN jsonb_build_object(
    'success', true, 'batch_id', v_batch_id, 'runner_ids', v_runner_ids,
    'expected_count', v_expected_count, 'reverted_count', v_reverted_count,
    'skipped_count', v_skipped_count, 'reverted_collect_amount', v_collect_amount,
    'reverted_order_ids', v_revert_ids, 'skipped_order_ids', v_skipped_ids,
    'skipped_orders', v_skipped_orders, 'affected_driver_ids', v_driver_ids
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_unassign_runner_driver_orders(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_unassign_runner_driver_orders(uuid[], date) TO authenticated;

COMMENT ON FUNCTION public.bulk_unassign_runner_driver_orders(uuid[], date) IS
  'Atomically returns canonical active Driver assignments in the authorized Runner scope to Unassigned and reports concurrent skips.';

NOTIFY pgrst, 'reload schema';
