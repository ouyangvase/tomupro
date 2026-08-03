-- Keep Driver Wall totals aligned with View Orders and the Driver App when an
-- actor can operate more than one Runner scope.

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
    CROSS JOIN LATERAL public.get_driver_assignment_source(
      NULL,
      NULL,
      NULL,
      p_operational_date,
      true,
      false
    ) source
    WHERE context.role = 'admin'

    UNION ALL

    SELECT source.*
    FROM actor_context context
    CROSS JOIN actor_runner_scopes scope
    CROSS JOIN LATERAL public.get_driver_assignment_source(
      scope.runner_id,
      NULL,
      NULL,
      p_operational_date,
      true,
      false
    ) source
    WHERE context.role <> 'admin'
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
  'Driver Workload aggregation over every Runner scope authorized for the actor, using the canonical Driver App assignment source.';

NOTIFY pgrst, 'reload schema';
