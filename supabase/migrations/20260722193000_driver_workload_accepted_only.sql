-- Driver workload must count only delivery orders accepted by the runner.
-- Pending/unaccepted driver assignments remain assignment progress, not driver workload.

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
  WITH linked_drivers AS (
    SELECT
      rd.driver_id,
      p.display_name AS driver_name,
      COALESCE(p.is_active, true) AND rd.is_active AS is_available,
      MAX(dap.capacity) AS capacity
    FROM public.runner_drivers rd
    JOIN public.profiles p ON p.id = rd.driver_id
    LEFT JOIN public.driver_area_preferences dap
      ON dap.runner_id = rd.runner_id
      AND dap.driver_id = rd.driver_id
      AND dap.active = true
    WHERE rd.is_active = true
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (public.get_user_role(auth.uid())::text = 'runner' AND rd.runner_id = auth.uid())
      )
    GROUP BY rd.driver_id, p.display_name, p.is_active, rd.is_active
  ),
  scoped_orders AS (
    SELECT
      o.driver_id,
      COALESCE(o.delivery_area_code, public.classify_delivery_area(o.address, o.status::text)->>'delivery_area') AS resolved_area_code,
      COALESCE(o.delivery_area_name, da.name, o.delivery_area_code, o.area) AS resolved_area_name,
      public.order_collection_amount(o.payment_method::text, o.total_amount) AS collect_amount
    FROM public.orders o
    LEFT JOIN public.delivery_areas da ON da.code = COALESCE(o.delivery_area_code, public.classify_delivery_area(o.address, o.status::text)->>'delivery_area')
    WHERE (
        (p_operational_date IS NULL AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text))
        OR (p_operational_date IS NOT NULL AND public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date)
      )
      AND o.driver_id IS NOT NULL
      AND COALESCE(o.driver_status, 'UNASSIGNED') <> 'UNASSIGNED'
      AND COALESCE(o.runner_accept_status::text, '') = 'ACCEPTED'
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (public.get_user_role(auth.uid())::text = 'runner' AND o.runner_id = auth.uid())
      )
  )
  SELECT
    ld.driver_id,
    ld.driver_name,
    ld.is_available,
    COUNT(so.driver_id)::integer AS assigned_order_count,
    COALESCE(SUM(so.collect_amount), 0)::numeric AS collect_amount,
    COALESCE(array_remove(array_agg(DISTINCT so.resolved_area_code), NULL), ARRAY[]::text[]) AS area_codes,
    COALESCE(array_remove(array_agg(DISTINCT so.resolved_area_name), NULL), ARRAY[]::text[]) AS area_names,
    ld.capacity,
    CASE WHEN ld.capacity IS NULL THEN NULL ELSE GREATEST(ld.capacity - COUNT(so.driver_id)::integer, 0) END AS remaining_capacity,
    'sent'::text AS notification_status
  FROM linked_drivers ld
  LEFT JOIN scoped_orders so ON so.driver_id = ld.driver_id
  GROUP BY ld.driver_id, ld.driver_name, ld.is_available, ld.capacity
  ORDER BY assigned_order_count DESC, ld.driver_name;
$$;
