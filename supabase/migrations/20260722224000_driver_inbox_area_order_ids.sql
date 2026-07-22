-- Source-of-truth order ids for Driver Inbox area bulk selection.
-- This uses the same active queue scope and area classification as
-- get_runner_dispatch_area_summary, so area tile counts and Assign Remaining
-- select the exact same orders.

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_area_order_ids(
  p_operational_date date,
  p_delivery_area_code text,
  p_unassigned_only boolean DEFAULT true
)
RETURNS TABLE (
  order_id uuid,
  order_code text,
  delivery_area_code text,
  delivery_area_name text,
  collect_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.id,
      o.order_code,
      o.driver_id,
      o.driver_status,
      o.runner_id,
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
  )
  SELECT
    s.id AS order_id,
    s.order_code,
    da.code AS delivery_area_code,
    da.name AS delivery_area_name,
    s.collect_amount
  FROM scoped s
  JOIN public.delivery_areas da ON da.code = s.resolved_area_code
  WHERE da.active = true
    AND da.is_special = false
    AND da.code = p_delivery_area_code
    AND (
      p_unassigned_only IS NOT TRUE
      OR s.driver_id IS NULL
      OR COALESCE(s.driver_status::text, 'UNASSIGNED') = 'UNASSIGNED'
    )
  ORDER BY s.order_code NULLS LAST, s.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_runner_dispatch_area_order_ids(date, text, boolean) TO authenticated;
