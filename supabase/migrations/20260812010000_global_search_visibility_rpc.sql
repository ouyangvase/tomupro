-- Global search must use the same server-derived order scope as the existing
-- order, dispatch, and driver surfaces. The client supplies only search text.
DROP FUNCTION IF EXISTS public.search_visible_orders(text, integer);

CREATE FUNCTION public.search_visible_orders(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  order_code text,
  customer_name text,
  phone text,
  runner_id uuid,
  runner_name text,
  status text,
  operational_status text,
  runner_status text,
  runner_review_status text,
  runner_final_outcome text,
  runner_comment text,
  runner_failed_reason_id uuid,
  salesperson_action_required boolean,
  salesperson_action_type text,
  next_delivery_date date,
  driver_next_delivery_date date,
  driver_failed_reason text,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH params AS (
    SELECT
      auth.uid() AS user_id,
      public.get_user_role(auth.uid())::text AS role,
      NULLIF(trim(coalesce(p_query, '')), '') AS query_text,
      greatest(1, least(coalesce(p_limit, 20), 20)) AS result_limit,
      public.get_accessible_owner_ids('orders') AS owner_ids,
      public.get_runner_assistant_runner_ids(
        auth.uid(),
        ARRAY[
          'cash_settlement',
          'driver_operations',
          'stock_audit',
          'inbound_stock',
          'driver_workload',
          'driver_inbox',
          'driver_stock',
          'deliver',
          'confirm_receipt'
        ]::text[]
      ) AS assistant_runner_ids
  ),
  driver_visible AS (
    SELECT DISTINCT source.order_id
    FROM params
    CROSS JOIN LATERAL public.get_driver_assignment_source(
      NULL,
      params.user_id,
      NULL,
      NULL,
      false,
      false
    ) AS source
    WHERE params.role = 'driver'
  )
  SELECT
    o.id,
    o.order_code,
    o.customer_name,
    o.phone,
    o.runner_id,
    coalesce(runner_profile.display_name, runner_profile.email, 'Unknown Runner')::text,
    o.status::text,
    o.operational_status,
    o.runner_status::text,
    o.runner_review_status,
    o.runner_final_outcome,
    o.runner_comment,
    o.runner_failed_reason_id,
    o.salesperson_action_required,
    o.salesperson_action_type,
    o.next_delivery_date,
    o.driver_next_delivery_date,
    o.driver_failed_reason,
    o.delivered_at,
    o.cancelled_at,
    o.created_at,
    o.updated_at
  FROM public.orders o
  CROSS JOIN params
  LEFT JOIN public.profiles runner_profile ON runner_profile.id = o.runner_id
  WHERE params.query_text IS NOT NULL
    AND length(params.query_text) >= 2
    AND (
      upper(replace(coalesce(o.order_code, ''), ' ', ''))
        LIKE '%' || upper(replace(params.query_text, ' ', '')) || '%'
      OR coalesce(o.customer_name, '') ILIKE '%' || params.query_text || '%'
      OR (
        params.query_text ~ '^[+0-9 ()-]+$'
        AND length(regexp_replace(coalesce(params.query_text, ''), '\D', '', 'g')) >= 3
        AND regexp_replace(coalesce(o.phone, ''), '\D', '', 'g')
          LIKE '%' || regexp_replace(params.query_text, '\D', '', 'g') || '%'
      )
    )
    AND (
      params.role = 'admin'
      OR (
        params.role NOT IN ('runner', 'runner_assistant', 'driver')
        AND (
          o.salesperson_id = ANY(coalesce(params.owner_ids, ARRAY[]::uuid[]))
          OR o.order_owner_id = ANY(coalesce(params.owner_ids, ARRAY[]::uuid[]))
        )
      )
      OR (params.role = 'runner' AND o.runner_id = params.user_id)
      OR (
        params.role = 'runner_assistant'
        AND o.runner_id = ANY(coalesce(params.assistant_runner_ids, ARRAY[]::uuid[]))
      )
      OR (params.role = 'driver' AND o.id IN (SELECT order_id FROM driver_visible))
    )
  ORDER BY
    CASE
      WHEN upper(replace(coalesce(o.order_code, ''), ' ', ''))
        LIKE upper(replace(params.query_text, ' ', '')) || '%' THEN 0
      ELSE 1
    END,
    o.updated_at DESC,
    o.id
  LIMIT (SELECT result_limit FROM params);
$$;

REVOKE ALL ON FUNCTION public.search_visible_orders(text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.search_visible_orders(text, integer) TO authenticated;
