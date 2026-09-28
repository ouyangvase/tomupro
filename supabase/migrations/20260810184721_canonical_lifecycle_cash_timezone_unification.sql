-- Canonical order lifecycle and accepted Driver delivery read model.
--
-- This migration does not rewrite existing order history.  It makes the
-- classification used by Driver assignment reads explicit and moves the
-- accepted-delivery list behind one server-side, Kuala Lumpur-date query.

CREATE OR REPLACE FUNCTION private.order_lifecycle_state(
  p_status text,
  p_operational_status text,
  p_driver_status text,
  p_runner_status text,
  p_runner_accept_status text,
  p_runner_review_status text,
  p_runner_final_outcome text,
  p_salesperson_action_required boolean,
  p_next_delivery_date date,
  p_driver_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  WITH normalized AS (
    SELECT
      upper(trim(coalesce(p_status, ''))) AS order_status,
      upper(trim(coalesce(p_operational_status, ''))) AS operational_status,
      upper(trim(coalesce(p_driver_status, ''))) AS driver_status,
      upper(trim(coalesce(p_runner_status, ''))) AS runner_status,
      upper(trim(coalesce(p_runner_accept_status, ''))) AS runner_accept_status,
      upper(trim(coalesce(p_runner_review_status, ''))) AS runner_review_status,
      upper(trim(coalesce(p_runner_final_outcome, ''))) AS runner_final_outcome
  )
  SELECT CASE
    WHEN order_status IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      OR operational_status IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      OR runner_status IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      THEN 'CANCELLED'

    -- A final Runner delivery is authoritative.  Stale Driver flags or a
    -- stale booking/reschedule marker must not put it back in review.
    WHEN runner_status = 'DELIVERED'
      OR operational_status = 'DELIVERED_FINAL'
      THEN 'DELIVERED_FINAL'

    -- Action Required is an explicit human-decision state.  It intentionally
    -- wins over a stale failed marker, while final Delivered above wins over
    -- stale action flags.
    WHEN coalesce(p_salesperson_action_required, false)
      OR runner_review_status = 'ACTION_REQUIRED'
      OR runner_final_outcome = 'NEED_SALESPERSON_FOLLOWUP'
      THEN 'ACTION_REQUIRED'

    WHEN runner_status = 'FAILED_DELIVERY'
      OR operational_status IN ('FAILED_FINAL', 'FAILED')
      THEN 'FAILED_FINAL'

    WHEN runner_final_outcome = 'RESCHEDULE'
      AND p_next_delivery_date IS NOT NULL
      AND order_status = 'READY'
      AND p_driver_id IS NULL
      THEN 'DELIVERY_TOMORROW'

    WHEN runner_final_outcome = 'RESCHEDULE'
      OR order_status IN ('BOOKING', 'RESCHEDULED')
      OR operational_status = 'RESCHEDULED'
      THEN 'CUSTOMER_RESCHEDULE'

    WHEN driver_status = 'DRIVER_DELIVERED'
      AND runner_accept_status <> 'ACCEPTED'
      AND runner_review_status <> 'REVIEWED'
      AND runner_status NOT IN ('DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND operational_status NOT IN ('DELIVERED_FINAL', 'FAILED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      THEN 'DRIVER_DELIVERED_PENDING_REVIEW'

    WHEN driver_status = 'DRIVER_FAILED'
      AND runner_accept_status <> 'ACCEPTED'
      AND runner_review_status <> 'REVIEWED'
      AND runner_status NOT IN ('DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND operational_status NOT IN ('DELIVERED_FINAL', 'FAILED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      THEN 'DRIVER_FAILED_PENDING_REVIEW'

    WHEN p_driver_id IS NOT NULL
      AND driver_status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
      AND order_status = 'READY'
      AND runner_status IN ('ASSIGNED', 'TAKEN')
      THEN 'ASSIGNED_ACTIVE'

    WHEN order_status = 'READY'
      AND runner_status IN ('ASSIGNED', 'TAKEN')
      AND p_driver_id IS NULL
      THEN 'READY_UNASSIGNED'

    WHEN order_status = 'BOOKING' OR operational_status = 'RESCHEDULED'
      THEN 'BOOKING'

    ELSE 'INACTIVE'
  END
  FROM normalized;
$function$;

COMMENT ON FUNCTION private.order_lifecycle_state(text, text, text, text, text, text, text, boolean, date, uuid)
  IS 'Canonical mutually-exclusive order lifecycle classification used by Driver and Runner read models.';

CREATE OR REPLACE FUNCTION public.get_driver_assignment_source(
  p_runner_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_active_only boolean DEFAULT false,
  p_include_items boolean DEFAULT true
)
RETURNS TABLE(
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
SET search_path TO public
AS $function$
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
      END AS effective_assignment_source
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
    WHERE o.driver_id IS NOT NULL
      AND coalesce(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND coalesce(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND coalesce(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND upper(coalesce(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
      AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
      AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
  ), classified AS (
    SELECT
      scoped.*,
      private.order_lifecycle_state(
        scoped.status::text,
        scoped.operational_status::text,
        scoped.driver_status::text,
        scoped.runner_status::text,
        coalesce(scoped.runner_accept_status::text, 'PENDING'),
        coalesce(scoped.runner_review_status::text, 'NOT_REVIEWED'),
        scoped.runner_final_outcome::text,
        scoped.salesperson_action_required,
        scoped.next_delivery_date,
        scoped.driver_id
      ) AS lifecycle_state
    FROM scoped
  ), eligible AS (
    SELECT classified.*
    FROM classified
    WHERE classified.lifecycle_state IN (
      'ASSIGNED_ACTIVE',
      'DRIVER_DELIVERED_PENDING_REVIEW',
      'DRIVER_FAILED_PENDING_REVIEW',
      'DELIVERED_FINAL',
      'FAILED_FINAL'
    )
      AND (
        p_date_from IS NULL
        OR classified.effective_assignment_date >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR classified.effective_assignment_date <= p_date_to
      )
      AND (
        p_active_only IS NOT TRUE
        OR classified.lifecycle_state IN ('ASSIGNED_ACTIVE', 'DRIVER_DELIVERED_PENDING_REVIEW', 'DRIVER_FAILED_PENDING_REVIEW')
      )
  )
  SELECT
    eligible.id,
    eligible.order_code,
    eligible.runner_id,
    eligible.driver_id,
    coalesce(driver_profile.display_name, driver_profile.email, 'Unknown Driver')::text,
    public.order_operational_date(eligible.next_delivery_date, eligible.expected_pickup_date, eligible.order_date),
    CASE eligible.lifecycle_state
      WHEN 'ASSIGNED_ACTIVE' THEN 'ACTIVE'
      WHEN 'DRIVER_DELIVERED_PENDING_REVIEW' THEN 'PENDING_ACCEPTANCE'
      WHEN 'DRIVER_FAILED_PENDING_REVIEW' THEN 'PENDING_ACCEPTANCE'
      WHEN 'DELIVERED_FINAL' THEN 'DELIVERED'
      WHEN 'FAILED_FINAL' THEN 'FAILED'
      ELSE 'INACTIVE'
    END,
    eligible.lifecycle_state = 'ASSIGNED_ACTIVE',
    public.order_collection_amount(eligible.payment_method::text, eligible.total_amount),
    to_jsonb(eligible)
      || jsonb_build_object(
        'effective_assignment_date', eligible.effective_assignment_date,
        'assignment_timestamp', eligible.effective_assignment_timestamp,
        'assignment_source', eligible.effective_assignment_source,
        'current_assignment_id', eligible.driver_assignment_batch_id,
        'canonical_lifecycle_state', eligible.lifecycle_state,
        'driver', jsonb_build_object(
          'id', driver_profile.id,
          'display_name', driver_profile.display_name,
          'email', driver_profile.email
        ),
        'order_items',
        CASE
          WHEN p_include_items THEN coalesce((
            SELECT jsonb_agg(
              to_jsonb(oi)
              || jsonb_build_object(
                'product', CASE
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
            WHERE oi.order_id = eligible.id
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      )
  FROM eligible
  LEFT JOIN public.profiles driver_profile ON driver_profile.id = eligible.driver_id
  WHERE (
    public.get_user_role(auth.uid())::text = 'admin'
    OR (
      public.get_user_role(auth.uid())::text = 'runner'
      AND eligible.runner_id = auth.uid()
    )
    OR (
      public.get_user_role(auth.uid())::text = 'driver'
      AND eligible.driver_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.runner_assistants ra
      WHERE ra.assistant_id = auth.uid()
        AND ra.runner_id = eligible.runner_id
        AND ra.is_active = true
        AND (
          ra.can_manage_driver_inbox = true
          OR ra.can_manage_driver_stock = true
          OR ra.can_view_driver_workload = true
        )
    )
  )
  ORDER BY eligible.effective_assignment_date DESC,
    eligible.effective_assignment_timestamp DESC,
    eligible.id;
$function$;

REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_runner_accepted_driver_deliveries(
  p_runner_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  order_code text,
  customer_name text,
  total_amount numeric,
  driver_id uuid,
  driver_payment_method text,
  driver_cash_amount numeric,
  driver_transfer_amount numeric,
  driver_delivered_at timestamptz,
  delivered_at timestamptz,
  delivery_event_at timestamptz,
  payment_method text,
  driver_name text,
  order_items jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF public.get_user_role(v_actor_id)::text <> 'admin'
    AND v_actor_id <> p_runner_id
    AND NOT public.has_runner_assistant_permission(v_actor_id, p_runner_id, 'cash_settlement')
  THEN
    RAISE EXCEPTION 'Cash Settlement access required';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.order_code,
    o.customer_name,
    o.total_amount,
    o.driver_id,
    o.driver_payment_method,
    coalesce(o.driver_cash_amount, CASE WHEN upper(o.payment_method::text) IN ('COD', 'CASH') THEN o.total_amount ELSE 0 END),
    coalesce(o.driver_transfer_amount, CASE WHEN upper(o.payment_method::text) IN ('TRANSFER', 'BANK_TRANSFER') THEN o.total_amount ELSE 0 END),
    o.driver_delivered_at,
    o.delivered_at,
    coalesce(liability.delivered_at, o.delivered_at, o.driver_delivered_at),
    o.payment_method::text,
    coalesce(driver.display_name, driver.email, 'Unknown Driver')::text,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('qty', oi.qty) ORDER BY oi.created_at, oi.id)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ), '[]'::jsonb)
  FROM public.orders o
  LEFT JOIN public.profiles driver ON driver.id = o.driver_id
  LEFT JOIN public.cash_liabilities liability ON liability.order_id = o.id
  WHERE o.runner_id = p_runner_id
    AND o.driver_status = 'DRIVER_DELIVERED'
    AND o.runner_accept_status = 'ACCEPTED'
    AND o.runner_status = 'DELIVERED'
    AND o.driver_id IS NOT NULL
    AND upper(coalesce(o.status::text, '')) NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
    AND (
      p_date_from IS NULL
      OR (coalesce(liability.delivered_at, o.delivered_at, o.driver_delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR (coalesce(liability.delivered_at, o.delivered_at, o.driver_delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= p_date_to
    )
  ORDER BY coalesce(liability.delivered_at, o.delivered_at, o.driver_delivered_at) DESC, o.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_runner_accepted_driver_deliveries(uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_runner_accepted_driver_deliveries(uuid, date, date, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_runner_accepted_driver_deliveries(uuid, date, date, uuid)
  IS 'Canonical Runner accepted Driver-delivery read model. Date filters use Asia/Kuala_Lumpur and have no fixed row limit.';
