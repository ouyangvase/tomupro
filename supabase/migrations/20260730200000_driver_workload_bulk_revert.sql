-- Driver Workload must use the exact active assignment source shown in Driver App.
-- Bulk revert clears assignment fields only; it does not change order outcomes,
-- finance records, inventory records, or stock movements.

CREATE OR REPLACE FUNCTION public.get_driver_assignment_source(
  p_runner_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_active_only boolean DEFAULT false,
  p_include_items boolean DEFAULT true
)
RETURNS TABLE (
  order_id uuid,
  order_code text,
  runner_id uuid,
  driver_id uuid,
  driver_name text,
  operational_date date,
  assignment_state text,
  is_active_assignment boolean,
  collect_amount numeric,
  order_data jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.order_code,
    o.runner_id,
    o.driver_id,
    COALESCE(driver_profile.display_name, driver_profile.email, 'Unknown Driver')::text,
    public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date),
    CASE
      WHEN o.driver_status::text = 'DRIVER_DELIVERED'
        AND o.runner_accept_status::text = 'ACCEPTED'
        AND o.runner_status::text = 'DELIVERED' THEN 'DELIVERED'
      WHEN o.driver_status::text = 'DRIVER_FAILED'
        AND o.runner_status::text = 'FAILED_DELIVERY'
        AND (
          o.runner_accept_status::text = 'ACCEPTED'
          OR (
            o.runner_review_status::text = 'REVIEWED'
            AND o.runner_final_outcome::text = 'CONFIRM_FAILED'
          )
        ) THEN 'FAILED'
      WHEN o.status::text = 'READY'
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'DRIVER_FAILED', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND NOT (
          o.runner_review_status::text = 'REVIEWED'
          AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
        ) THEN 'ACTIVE'
      WHEN o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
        THEN 'PENDING_ACCEPTANCE'
      ELSE 'INACTIVE'
    END,
    o.status::text = 'READY'
      AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
      AND COALESCE(o.operational_status::text, '') NOT IN (
        'DELIVERED_FINAL', 'DRIVER_FAILED', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
      )
      AND COALESCE(o.runner_status::text, '') NOT IN (
        'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
      )
      AND NOT (
        o.runner_review_status::text = 'REVIEWED'
        AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
      ),
    public.order_collection_amount(o.payment_method::text, o.total_amount),
    to_jsonb(o)
      || jsonb_build_object(
        'driver', jsonb_build_object(
          'id', driver_profile.id,
          'display_name', driver_profile.display_name,
          'email', driver_profile.email
        ),
        'order_items',
        CASE
          WHEN p_include_items THEN COALESCE((
            SELECT jsonb_agg(
              to_jsonb(oi)
              || jsonb_build_object(
                'product',
                CASE
                  WHEN product.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'id', product.id,
                    'sku_code', product.sku_code,
                    'sku_name', product.sku_name
                  )
                END
              )
              ORDER BY oi.created_at, oi.id
            )
            FROM public.order_items oi
            LEFT JOIN public.products product ON product.id = oi.product_id
            WHERE oi.order_id = o.id
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      )
  FROM public.orders o
  LEFT JOIN public.profiles driver_profile ON driver_profile.id = o.driver_id
  WHERE o.driver_id IS NOT NULL
    AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
    AND (
      p_date_from IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) <= p_date_to
    )
    AND (
      p_active_only IS NOT TRUE
      OR (
        o.status::text = 'READY'
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'DRIVER_FAILED', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND NOT (
          o.runner_review_status::text = 'REVIEWED'
          AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
        )
      )
    )
    AND (
      public.get_user_role(auth.uid())::text = 'admin'
      OR (
        public.get_user_role(auth.uid())::text = 'runner'
        AND o.runner_id = auth.uid()
      )
      OR (
        public.get_user_role(auth.uid())::text = 'driver'
        AND o.driver_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.runner_id = o.runner_id
          AND ra.is_active = true
          AND (
            ra.can_manage_driver_inbox = true
            OR ra.can_manage_driver_stock = true
            OR ra.can_view_driver_workload = true
          )
      )
    )
  ORDER BY public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) DESC,
    o.created_at DESC,
    o.id;
$$;

REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) IS
  'Canonical Driver App assignment source. Workload viewers share the same active queue without a second status calculation.';

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_driver_workloads(p_operational_date date)
RETURNS TABLE (
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
AS $$
  WITH actor_scope AS (
    SELECT CASE
      WHEN public.get_user_role(auth.uid())::text = 'runner' THEN auth.uid()
      WHEN EXISTS (
        SELECT 1
        FROM public.runner_assistants binding
        WHERE binding.assistant_id = auth.uid()
          AND binding.is_active = true
          AND (
            binding.can_manage_driver_inbox = true
            OR binding.can_manage_driver_stock = true
            OR binding.can_view_driver_workload = true
          )
      ) THEN (
        SELECT ra.runner_id
        FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.is_active = true
          AND (
            ra.can_manage_driver_inbox = true
            OR ra.can_manage_driver_stock = true
            OR ra.can_view_driver_workload = true
          )
        LIMIT 1
      )
      ELSE NULL::uuid
    END AS runner_id
  ),
  assignments AS (
    SELECT source.*
    FROM actor_scope scope
    CROSS JOIN LATERAL public.get_driver_assignment_source(
      scope.runner_id,
      NULL,
      NULL,
      p_operational_date,
      true,
      false
    ) source
  ),
  linked_drivers AS (
    SELECT
      rd.driver_id,
      COALESCE(p.display_name, p.email, 'Unknown Driver')::text AS driver_name,
      COALESCE(p.is_active, true) AND rd.is_active AS is_available,
      MAX(dap.capacity) AS capacity
    FROM public.runner_drivers rd
    CROSS JOIN actor_scope scope
    JOIN public.profiles p ON p.id = rd.driver_id
    LEFT JOIN public.driver_area_preferences dap
      ON dap.runner_id = rd.runner_id
      AND dap.driver_id = rd.driver_id
      AND dap.active = true
    WHERE rd.is_active = true
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR rd.runner_id = scope.runner_id
      )
    GROUP BY rd.driver_id, p.display_name, p.email, p.is_active, rd.is_active
  ),
  driver_pool AS (
    SELECT
      linked.driver_id,
      linked.driver_name,
      linked.is_available,
      linked.capacity
    FROM linked_drivers linked

    UNION ALL

    SELECT DISTINCT
      assignment.driver_id,
      assignment.driver_name,
      true,
      NULL::integer
    FROM assignments assignment
    WHERE NOT EXISTS (
      SELECT 1
      FROM linked_drivers linked
      WHERE linked.driver_id = assignment.driver_id
    )
  )
  SELECT
    pool.driver_id,
    pool.driver_name,
    pool.is_available,
    COUNT(assignments.order_id)::integer,
    COALESCE(SUM(assignments.collect_amount), 0)::numeric,
    COALESCE(array_remove(array_agg(DISTINCT assignments.order_data->>'delivery_area_code'), NULL), ARRAY[]::text[]),
    COALESCE(array_remove(array_agg(DISTINCT COALESCE(
      assignments.order_data->>'delivery_area_name',
      assignments.order_data->>'area'
    )), NULL), ARRAY[]::text[]),
    pool.capacity,
    CASE
      WHEN pool.capacity IS NULL THEN NULL
      ELSE GREATEST(pool.capacity - COUNT(assignments.order_id)::integer, 0)
    END,
    'sent'::text
  FROM driver_pool pool
  LEFT JOIN assignments ON assignments.driver_id = pool.driver_id
  GROUP BY pool.driver_id, pool.driver_name, pool.is_available, pool.capacity
  ORDER BY COUNT(assignments.order_id) DESC, pool.driver_name;
$$;

REVOKE ALL ON FUNCTION public.get_runner_dispatch_driver_workloads(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_dispatch_driver_workloads(date) TO authenticated;

COMMENT ON FUNCTION public.get_runner_dispatch_driver_workloads(date) IS
  'Driver Workload aggregation over the canonical Driver App active assignment source.';

CREATE OR REPLACE FUNCTION public.bulk_revert_driver_app_orders(
  p_runner_id uuid,
  p_driver_id uuid,
  p_expected_order_ids uuid[],
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
  v_expected_ids uuid[];
  v_revert_ids uuid[];
  v_expected_count integer := 0;
  v_reverted_count integer := 0;
  v_skipped_count integer := 0;
  v_collect_amount numeric(12,2) := 0;
  v_driver_name text;
  v_batch_id uuid;
  v_before_assignments jsonb := '[]'::jsonb;
  v_notification_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_runner_id IS NULL OR p_driver_id IS NULL THEN
    RAISE EXCEPTION 'Runner and Driver are required';
  END IF;

  IF NOT (
    v_actor_role = 'admin'
    OR (v_actor_role = 'runner' AND v_actor_id = p_runner_id)
    OR public.has_runner_assistant_permission(v_actor_id, p_runner_id, 'driver_inbox')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to revert Driver assignments';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT expected.expected_id), ARRAY[]::uuid[])
  INTO v_expected_ids
  FROM unnest(COALESCE(p_expected_order_ids, ARRAY[]::uuid[])) AS expected(expected_id);

  v_expected_count := cardinality(v_expected_ids);
  IF v_expected_count = 0 THEN
    RAISE EXCEPTION 'No current Driver App orders were selected';
  END IF;

  SELECT COALESCE(p.display_name, p.email, 'Unknown Driver')
  INTO v_driver_name
  FROM public.profiles p
  WHERE p.id = p_driver_id;

  IF v_driver_name IS NULL THEN
    RAISE EXCEPTION 'Selected Driver is invalid';
  END IF;

  -- Lock the confirmed snapshot. A second canonical lookup below skips rows
  -- that completed or otherwise left Driver App while the modal was open.
  PERFORM o.id
  FROM public.orders o
  WHERE o.id = ANY(v_expected_ids)
    AND o.runner_id = p_runner_id
    AND o.driver_id = p_driver_id
  ORDER BY o.id
  FOR UPDATE;

  SELECT COALESCE(array_agg(source.order_id ORDER BY source.order_id), ARRAY[]::uuid[])
  INTO v_revert_ids
  FROM public.get_driver_assignment_source(
    p_runner_id,
    p_driver_id,
    NULL,
    p_operational_date,
    true,
    false
  ) source
  WHERE source.order_id = ANY(v_expected_ids);

  v_reverted_count := cardinality(v_revert_ids);
  v_skipped_count := v_expected_count - v_reverted_count;

  IF v_reverted_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'batch_id', NULL,
      'driver_id', p_driver_id,
      'driver_name', v_driver_name,
      'expected_count', v_expected_count,
      'reverted_count', 0,
      'skipped_count', v_skipped_count,
      'reverted_collect_amount', 0,
      'reverted_order_ids', ARRAY[]::uuid[]
    );
  END IF;

  SELECT
    COALESCE(SUM(public.order_collection_amount(o.payment_method::text, o.total_amount)), 0)::numeric,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'order_id', o.id,
        'order_code', o.order_code,
        'driver_id', o.driver_id,
        'driver_status', o.driver_status,
        'driver_assignment_batch_id', o.driver_assignment_batch_id,
        'driver_assigned_at', o.driver_assigned_at,
        'driver_assigned_by', o.driver_assigned_by
      )
      ORDER BY o.order_code, o.id
    ), '[]'::jsonb)
  INTO v_collect_amount, v_before_assignments
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
    p_driver_id,
    NULL,
    v_actor_id,
    jsonb_build_object(
      'status', 'applied',
      'source', 'DRIVER_WORKLOAD',
      'reason', 'Manual bulk revert from Driver Workload',
      'runner_id', p_runner_id,
      'driver_id', p_driver_id,
      'driver_name', v_driver_name,
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
      'reason', 'Manual bulk revert from Driver Workload'
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

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    priority,
    reference_type,
    reference_id,
    entity_type,
    recipient_role
  )
  VALUES (
    p_driver_id,
    'Active Workload Updated',
    v_reverted_count || ' order(s) have been removed from your active workload and returned to Dispatch.',
    'DRIVER_BULK_ASSIGNMENT_REMOVED',
    'HIGH',
    'driver_assignment_batch',
    v_batch_id,
    'DRIVER_ASSIGNMENT',
    'driver'
  )
  RETURNING id INTO v_notification_id;

  UPDATE public.driver_assignment_batches
  SET notification_id = v_notification_id,
      result_summary = result_summary || jsonb_build_object('notification_id', v_notification_id)
  WHERE id = v_batch_id;

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
    'BULK_REVERT_DRIVER_ORDERS',
    v_actor_id,
    jsonb_build_object(
      'assignments', v_before_assignments,
      'expected_order_ids', v_expected_ids
    ),
    jsonb_build_object(
      'runner_id', p_runner_id,
      'driver_id', p_driver_id,
      'driver_name', v_driver_name,
      'order_count', v_reverted_count,
      'affected_order_ids', v_revert_ids,
      'skipped_count', v_skipped_count,
      'performed_by', v_actor_id,
      'performed_at', now(),
      'reason', 'Manual bulk revert from Driver Workload',
      'resulting_state', 'UNASSIGNED'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'driver_id', p_driver_id,
    'driver_name', v_driver_name,
    'expected_count', v_expected_count,
    'reverted_count', v_reverted_count,
    'skipped_count', v_skipped_count,
    'reverted_collect_amount', v_collect_amount,
    'reverted_order_ids', v_revert_ids,
    'notification_id', v_notification_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_revert_driver_app_orders(uuid, uuid, uuid[], date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_revert_driver_app_orders(uuid, uuid, uuid[], date)
  TO authenticated;

COMMENT ON FUNCTION public.bulk_revert_driver_app_orders(uuid, uuid, uuid[], date) IS
  'Atomically revalidates and unassigns only the confirmed canonical Driver App active-order snapshot.';

NOTIFY pgrst, 'reload schema';
