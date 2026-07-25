-- Final business states override stale driver_status values left by legacy orders.
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
      WHEN (
        o.driver_status::text = 'DRIVER_DELIVERED'
        AND o.runner_accept_status::text = 'ACCEPTED'
      ) OR o.operational_status::text = 'DELIVERED_FINAL' THEN 'DELIVERED'
      WHEN o.driver_status::text = 'DRIVER_FAILED'
        OR o.operational_status::text = 'DRIVER_FAILED'
        OR o.runner_status::text = 'FAILED_DELIVERY' THEN 'FAILED'
      WHEN o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'DRIVER_FAILED', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        ) THEN 'ACTIVE'
      WHEN o.driver_status::text = 'DRIVER_DELIVERED' THEN 'PENDING_REVIEW'
      ELSE 'INACTIVE'
    END,
    o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
      AND COALESCE(o.operational_status::text, '') NOT IN (
        'DELIVERED_FINAL', 'DRIVER_FAILED', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
      )
      AND COALESCE(o.runner_status::text, '') NOT IN (
        'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
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
        o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'DRIVER_FAILED', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
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
          AND (ra.can_manage_driver_inbox = true OR ra.can_manage_driver_stock = true)
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
  'Canonical assignment source. Final business states override stale driver status; active queries retain overdue unfinished jobs.';

-- Active driver workload includes overdue jobs until the driver completes them.
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
          )
      ) THEN (
        SELECT ra.runner_id
        FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.is_active = true
          AND (ra.can_manage_driver_inbox = true OR ra.can_manage_driver_stock = true)
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
  'Canonical active workload through the requested operational date, including overdue unfinished jobs.';
