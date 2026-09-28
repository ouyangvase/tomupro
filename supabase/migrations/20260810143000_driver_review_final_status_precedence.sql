-- Final Runner outcomes are authoritative for the review queue.
-- A stale Driver submission must not revive an order after it is DELIVERED or
-- FAILED_DELIVERY, even when the legacy acceptance/review fields are pending.

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
  WITH scoped AS (
    SELECT
      o.*,
      COALESCE(
        private.driver_analytics_assignment_date(
          o.driver_assigned_at,
          batch.created_at,
          assignment_audit.created_at
        ),
        public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
      ) AS effective_assignment_date,
      COALESCE(o.driver_assigned_at, batch.created_at, assignment_audit.created_at, o.created_at) AS effective_assignment_timestamp,
      CASE
        WHEN o.driver_assigned_at IS NOT NULL THEN 'driver_assigned_at'
        WHEN batch.created_at IS NOT NULL THEN 'driver_assignment_batch'
        WHEN assignment_audit.created_at IS NOT NULL THEN 'assignment_audit'
        ELSE 'order_operational_date_fallback'
      END AS effective_assignment_source,
      public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_review_status::text, '') <> 'ACTION_REQUIRED'
        AND COALESCE(o.runner_final_outcome::text, '') <> 'NEED_SALESPERSON_FOLLOWUP'
        AS is_active,
      o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_review_status::text, '') <> 'ACTION_REQUIRED'
        AND COALESCE(o.runner_final_outcome::text, '') <> 'NEED_SALESPERSON_FOLLOWUP'
        AS is_pending_review
    FROM public.orders o
    LEFT JOIN public.driver_assignment_batches batch
      ON batch.id = o.driver_assignment_batch_id
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.action IN (
          'DRIVER_ASSIGNED',
          'DRIVER_REASSIGNED',
          'ORDER_ASSIGNED_TO_DRIVER'
        )
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) assignment_audit ON true
    WHERE o.driver_id IS NOT NULL
      AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND UPPER(COALESCE(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
      AND (
        p_date_from IS NULL
        OR COALESCE(
          private.driver_analytics_assignment_date(
            o.driver_assigned_at,
            batch.created_at,
            assignment_audit.created_at
          ),
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
        ) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR COALESCE(
          private.driver_analytics_assignment_date(
            o.driver_assigned_at,
            batch.created_at,
            assignment_audit.created_at
          ),
          public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
        ) <= p_date_to
      )
      AND (
        COALESCE(o.status::text, '') NOT IN (
          'DELIVERED', 'FAILED', 'FAILED_DELIVERY', 'COMPLETED', 'APPROVED',
          'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        OR (
          o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
          AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
          AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
          AND COALESCE(o.runner_status::text, '') NOT IN (
            'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
          )
        )
      )
  )
  SELECT
    scoped.id,
    scoped.order_code,
    scoped.runner_id,
    scoped.driver_id,
    COALESCE(driver_profile.display_name, driver_profile.email, 'Unknown Driver')::text,
    public.order_operational_date(scoped.next_delivery_date, scoped.expected_pickup_date, scoped.order_date),
    CASE
      WHEN scoped.is_pending_review THEN 'PENDING_ACCEPTANCE'
      WHEN scoped.driver_status::text = 'DRIVER_DELIVERED'
        AND scoped.runner_accept_status::text = 'ACCEPTED'
        AND scoped.runner_status::text = 'DELIVERED'
        THEN 'DELIVERED'
      WHEN scoped.driver_status::text = 'DRIVER_FAILED'
        AND scoped.runner_accept_status::text = 'ACCEPTED'
        AND scoped.runner_status::text = 'FAILED_DELIVERY'
        THEN 'FAILED'
      WHEN scoped.is_active THEN 'ACTIVE'
      ELSE 'INACTIVE'
    END,
    scoped.is_active,
    public.order_collection_amount(scoped.payment_method::text, scoped.total_amount),
    to_jsonb(scoped)
      || jsonb_build_object(
        'effective_assignment_date', scoped.effective_assignment_date,
        'assignment_timestamp', scoped.effective_assignment_timestamp,
        'assignment_source', scoped.effective_assignment_source,
        'current_assignment_id', scoped.driver_assignment_batch_id,
        'canonical_lifecycle_state', CASE
          WHEN scoped.is_pending_review THEN 'PENDING_ACCEPTANCE'
          WHEN scoped.driver_status::text = 'DRIVER_DELIVERED'
            AND scoped.runner_accept_status::text = 'ACCEPTED'
            AND scoped.runner_status::text = 'DELIVERED'
            THEN 'DELIVERED'
          WHEN scoped.driver_status::text = 'DRIVER_FAILED'
            AND scoped.runner_accept_status::text = 'ACCEPTED'
            AND scoped.runner_status::text = 'FAILED_DELIVERY'
            THEN 'FAILED'
          WHEN scoped.is_active THEN 'ACTIVE'
          ELSE 'INACTIVE'
        END,
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
            WHERE oi.order_id = scoped.id
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      )
  FROM scoped
  LEFT JOIN public.profiles driver_profile ON driver_profile.id = scoped.driver_id
  WHERE (
    p_active_only IS NOT TRUE
    OR scoped.is_active
    OR scoped.is_pending_review
  )
  AND (
    public.get_user_role(auth.uid())::text = 'admin'
    OR (
      public.get_user_role(auth.uid())::text = 'runner'
      AND scoped.runner_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid())::text = 'driver'
      AND scoped.driver_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = scoped.runner_id
        AND ra.is_active = true
        AND (
          ra.can_manage_driver_inbox = true
          OR ra.can_manage_driver_stock = true
          OR ra.can_view_driver_workload = true
        )
    )
  )
  ORDER BY scoped.effective_assignment_date DESC,
    scoped.effective_assignment_timestamp DESC,
    scoped.id;
$$;

REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) IS
  'Canonical Driver lifecycle source. Final Runner statuses always win over stale Driver submissions.';

NOTIFY pgrst, 'reload schema';
