-- Driver Analytics uses the effective assignment date and one current row per
-- order. Driver submission time is retained only as evidence, never as the
-- calendar cohort date.

CREATE OR REPLACE FUNCTION private.get_driver_analytics_cohort(
  p_driver_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  order_id uuid,
  driver_id uuid,
  runner_id uuid,
  effective_assignment_date date,
  assignment_timestamp timestamptz,
  assignment_source text,
  assignment_batch_id uuid,
  reassigned boolean,
  order_amount numeric,
  payment_method text,
  driver_payment_method text,
  assignment_state text,
  accepted_delivery boolean,
  accepted_failed boolean,
  pending_acceptance boolean,
  cash_collected_amount numeric,
  transfer_amount numeric,
  cash_pending_amount numeric,
  cash_settlement_status text,
  driver_status text,
  runner_status text,
  runner_accept_status text,
  driver_submitted_at timestamptz,
  runner_accepted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH assigned_orders AS (
    SELECT
      o.*,
      batch.created_at AS assignment_batch_created_at,
      assignment_audit.created_at AS assignment_audit_at,
      COALESCE(
        private.driver_analytics_assignment_date(
          o.driver_assigned_at,
          batch.created_at,
          assignment_audit.created_at
        ),
        public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date)
      ) AS effective_assignment_date,
      COALESCE(o.driver_assigned_at, batch.created_at, assignment_audit.created_at, o.created_at) AS assignment_timestamp,
      CASE
        WHEN o.driver_assigned_at IS NOT NULL THEN 'driver_assigned_at'
        WHEN batch.created_at IS NOT NULL THEN 'driver_assignment_batch'
        WHEN assignment_audit.created_at IS NOT NULL THEN 'assignment_audit'
        ELSE 'order_operational_date_fallback'
      END AS assignment_source,
      o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
        AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
        AND COALESCE(o.operational_status::text, '') NOT IN ('DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
        AND COALESCE(o.salesperson_action_required, false) IS NOT TRUE
        AND COALESCE(o.runner_review_status::text, '') <> 'ACTION_REQUIRED'
        AND COALESCE(o.runner_final_outcome::text, '') <> 'NEED_SALESPERSON_FOLLOWUP'
        AS is_pending_acceptance,
      o.driver_status::text = 'DRIVER_DELIVERED'
        AND COALESCE(o.runner_accept_status::text, '') = 'ACCEPTED'
        AND COALESCE(o.runner_status::text, '') = 'DELIVERED'
        AS is_accepted_delivery,
      o.driver_status::text = 'DRIVER_FAILED'
        AND COALESCE(o.runner_accept_status::text, '') = 'ACCEPTED'
        AND COALESCE(o.runner_status::text, '') = 'FAILED_DELIVERY'
        AS is_accepted_failed,
      o.runner_final_outcome::text = 'RESCHEDULE'
        AND COALESCE(o.runner_review_status::text, '') = 'REVIEWED'
        AS is_rescheduled
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
    WHERE o.driver_id = p_driver_id
      AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND upper(COALESCE(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
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
  ), financials AS (
    SELECT
      assigned_orders.*,
      payment.cash_amount AS reported_cash_amount,
      payment.transfer_amount AS reported_transfer_amount
    FROM assigned_orders
    CROSS JOIN LATERAL private.driver_analytics_reported_payment_components(
      COALESCE(assigned_orders.total_amount, 0)::numeric,
      assigned_orders.payment_method::text,
      assigned_orders.driver_payment_method,
      assigned_orders.driver_cash_amount,
      assigned_orders.driver_transfer_amount
    ) payment
  ), liabilities AS (
    SELECT
      financials.*,
      COALESCE(liability.open_amount, 0)::numeric AS liability_open_amount,
      COALESCE(liability.has_pending_handover, false) AS liability_has_pending_handover,
      COALESCE(liability.has_settled, false) AS liability_has_settled,
      accepted_audit.created_at AS runner_accepted_audit_at
    FROM financials
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(item.cash_amount) FILTER (
          WHERE item.status IN ('OPEN', 'PENDING_HANDOVER')
        ), 0)::numeric AS open_amount,
        COALESCE(bool_or(item.status = 'PENDING_HANDOVER'), false) AS has_pending_handover,
        COALESCE(bool_or(item.status = 'SETTLED'), false) AS has_settled
      FROM public.cash_liabilities item
      WHERE item.order_id = financials.id
        AND item.driver_id = p_driver_id
    ) liability ON true
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = financials.id
        AND audit.action = 'DRIVER_DELIVERY_ACCEPTED'
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) accepted_audit ON true
  )
  SELECT
    liabilities.id,
    liabilities.driver_id,
    liabilities.runner_id,
    liabilities.effective_assignment_date,
    liabilities.assignment_timestamp,
    liabilities.assignment_source,
    liabilities.driver_assignment_batch_id,
    false,
    liabilities.total_amount::numeric,
    liabilities.payment_method::text,
    liabilities.driver_payment_method,
    CASE
      WHEN liabilities.is_pending_acceptance THEN 'PENDING_ACCEPTANCE'
      WHEN liabilities.is_accepted_delivery THEN 'DELIVERED'
      WHEN liabilities.is_accepted_failed THEN 'FAILED'
      WHEN liabilities.is_rescheduled THEN 'RESCHEDULED'
      WHEN liabilities.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY') THEN 'ACTIVE'
      ELSE 'INACTIVE'
    END,
    liabilities.is_accepted_delivery,
    liabilities.is_accepted_failed,
    liabilities.is_pending_acceptance,
    CASE WHEN liabilities.is_accepted_delivery THEN liabilities.reported_cash_amount ELSE 0::numeric END,
    CASE WHEN liabilities.is_accepted_delivery THEN liabilities.reported_transfer_amount ELSE 0::numeric END,
    CASE
      WHEN liabilities.reported_cash_amount <= 0 THEN 0::numeric
      WHEN NOT liabilities.is_accepted_delivery THEN liabilities.reported_cash_amount
      ELSE liabilities.liability_open_amount
    END,
    CASE
      WHEN liabilities.reported_cash_amount <= 0 THEN 'NOT_APPLICABLE'
      WHEN NOT liabilities.is_accepted_delivery THEN 'PENDING_ACCEPTANCE'
      WHEN liabilities.liability_open_amount > 0 AND liabilities.liability_has_pending_handover THEN 'PENDING_HANDOVER'
      WHEN liabilities.liability_open_amount > 0 THEN 'OPEN'
      WHEN liabilities.liability_has_settled THEN 'SETTLED'
      ELSE 'UNKNOWN'
    END,
    liabilities.driver_status::text,
    liabilities.runner_status::text,
    liabilities.runner_accept_status::text,
    COALESCE(liabilities.driver_delivered_at, liabilities.driver_failed_at),
    liabilities.runner_accepted_audit_at
  FROM liabilities
  ORDER BY liabilities.effective_assignment_date, liabilities.id;
$$;

NOTIFY pgrst, 'reload schema';
