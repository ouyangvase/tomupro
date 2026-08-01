-- Driver Analytics is attributed to the actual Driver assignment event.
-- Business schedule/reschedule dates do not move an assignment between days.
-- Terminal outcomes are included only when the assigned Driver performed them.

CREATE OR REPLACE FUNCTION private.driver_analytics_assignment_date(
  p_assigned_at timestamptz,
  p_batch_created_at timestamptz,
  p_assignment_audit_at timestamptz
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT (
    COALESCE(p_assigned_at, p_batch_created_at, p_assignment_audit_at)
    AT TIME ZONE 'Asia/Brunei'
  )::date;
$$;

CREATE OR REPLACE FUNCTION private.driver_analytics_is_outcome_eligible(
  p_driver_status text,
  p_runner_status text,
  p_has_current_driver_outcome boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_driver_status, '') IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
      OR COALESCE(p_runner_status, '') IN ('DELIVERED', 'FAILED_DELIVERY')
      THEN COALESCE(p_has_current_driver_outcome, false)
    ELSE true
  END;
$$;

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
  WITH attributed AS (
    SELECT
      o.*,
      batch.action AS batch_action,
      batch.old_driver_id AS batch_old_driver_id,
      batch.created_at AS batch_created_at,
      assignment_audit.created_at AS assignment_audit_at,
      driver_outcome_audit.created_at AS driver_outcome_audit_at,
      accepted_audit.created_at AS runner_accepted_audit_at,
      liability.open_amount AS liability_open_amount,
      liability.has_pending_handover AS liability_has_pending_handover,
      liability.has_settled AS liability_has_settled
    FROM public.orders o
    LEFT JOIN public.driver_assignment_batches batch
      ON batch.id = o.driver_assignment_batch_id
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.after_json->>'driver_id' = p_driver_id::text
        AND (
          upper(audit.action) LIKE '%DRIVER%ASSIGN%'
          OR upper(audit.action) LIKE '%DRIVER%CHANG%'
        )
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) assignment_audit ON true
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.actor_id = p_driver_id
        AND audit.after_json->>'driver_status' = o.driver_status::text
        AND audit.after_json->>'driver_status' IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND audit.created_at >= COALESCE(
          o.driver_assigned_at,
          batch.created_at,
          assignment_audit.created_at,
          '-infinity'::timestamptz
        )
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) driver_outcome_audit ON true
    LEFT JOIN LATERAL (
      SELECT audit.created_at
      FROM public.audit_logs audit
      WHERE audit.entity_type = 'order'
        AND audit.entity_id = o.id
        AND audit.action = 'DRIVER_DELIVERY_ACCEPTED'
      ORDER BY audit.created_at DESC, audit.id DESC
      LIMIT 1
    ) accepted_audit ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(item.cash_amount) FILTER (
          WHERE item.status IN ('OPEN', 'PENDING_HANDOVER')
        ), 0)::numeric AS open_amount,
        COALESCE(bool_or(item.status = 'PENDING_HANDOVER'), false) AS has_pending_handover,
        COALESCE(bool_or(item.status = 'SETTLED'), false) AS has_settled
      FROM public.cash_liabilities item
      WHERE item.order_id = o.id
        AND item.driver_id = p_driver_id
    ) liability ON true
    WHERE o.driver_id = p_driver_id
      AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      AND COALESCE(o.delivery_area_code, '') NOT IN ('SELF_PICKUP', 'CANCELLED')
      AND upper(COALESCE(o.order_source, 'SALESPERSON')) NOT IN ('TEST', 'DEMO')
  ), normalized AS (
    SELECT
      attributed.*,
      private.driver_analytics_assignment_date(
        attributed.driver_assigned_at,
        attributed.batch_created_at,
        attributed.assignment_audit_at
      ) AS analytics_date,
      COALESCE(
        attributed.driver_assigned_at,
        attributed.batch_created_at,
        attributed.assignment_audit_at
      ) AS analytics_assigned_at,
      CASE
        WHEN attributed.driver_assigned_at IS NOT NULL THEN 'driver_assigned_at_brunei'
        WHEN attributed.batch_created_at IS NOT NULL THEN 'assignment_batch_created_at_brunei'
        WHEN attributed.assignment_audit_at IS NOT NULL THEN 'assignment_audit_brunei'
        ELSE NULL
      END AS analytics_source,
      private.driver_analytics_is_accepted_delivery(
        attributed.driver_status::text,
        attributed.runner_accept_status::text,
        attributed.runner_status::text
      ) AS is_accepted_delivery,
      (
        COALESCE(attributed.driver_status::text, '') = 'DRIVER_FAILED'
        AND COALESCE(attributed.runner_accept_status::text, '') = 'ACCEPTED'
        AND COALESCE(attributed.runner_status::text, '') = 'FAILED_DELIVERY'
      ) AS is_accepted_failed,
      public.order_collection_amount(
        attributed.payment_method::text,
        attributed.total_amount
      )::numeric AS analytics_amount
    FROM attributed
  ), financials AS (
    SELECT
      normalized.*,
      payment.cash_amount AS analytics_cash_amount,
      payment.transfer_amount AS analytics_transfer_amount
    FROM normalized
    CROSS JOIN LATERAL private.driver_analytics_payment_components(
      normalized.is_accepted_delivery,
      normalized.analytics_amount,
      normalized.payment_method::text,
      normalized.driver_payment_method,
      normalized.driver_cash_amount,
      normalized.driver_transfer_amount
    ) payment
    WHERE normalized.analytics_date IS NOT NULL
      AND private.driver_analytics_is_outcome_eligible(
        normalized.driver_status::text,
        normalized.runner_status::text,
        normalized.driver_outcome_audit_at IS NOT NULL
      )
      AND (p_date_from IS NULL OR normalized.analytics_date >= p_date_from)
      AND (p_date_to IS NULL OR normalized.analytics_date <= p_date_to)
  )
  SELECT
    financials.id,
    financials.driver_id,
    financials.runner_id,
    financials.analytics_date,
    financials.analytics_assigned_at,
    financials.analytics_source,
    financials.driver_assignment_batch_id,
    (
      COALESCE(financials.batch_action, '') = 'REASSIGN'
      OR financials.batch_old_driver_id IS NOT NULL
    ),
    financials.analytics_amount,
    financials.payment_method::text,
    financials.driver_payment_method,
    CASE
      WHEN financials.is_accepted_delivery THEN 'DELIVERED'
      WHEN financials.is_accepted_failed THEN 'FAILED'
      WHEN financials.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(financials.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        THEN 'PENDING_ACCEPTANCE'
      ELSE 'ACTIVE'
    END,
    financials.is_accepted_delivery,
    financials.is_accepted_failed,
    (
      financials.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
      AND COALESCE(financials.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
    ),
    financials.analytics_cash_amount,
    financials.analytics_transfer_amount,
    CASE
      WHEN financials.is_accepted_delivery THEN COALESCE(financials.liability_open_amount, 0)
      ELSE 0::numeric
    END,
    CASE
      WHEN financials.analytics_cash_amount <= 0 THEN 'NOT_APPLICABLE'
      WHEN COALESCE(financials.liability_open_amount, 0) > 0
        AND financials.liability_has_pending_handover THEN 'PENDING_HANDOVER'
      WHEN COALESCE(financials.liability_open_amount, 0) > 0 THEN 'OPEN'
      WHEN financials.liability_has_settled THEN 'SETTLED'
      ELSE 'UNKNOWN'
    END,
    financials.driver_status::text,
    financials.runner_status::text,
    financials.runner_accept_status::text,
    COALESCE(
      financials.driver_outcome_audit_at,
      financials.driver_delivered_at,
      financials.driver_failed_at
    ),
    financials.runner_accepted_audit_at
  FROM financials
  ORDER BY financials.analytics_date, financials.analytics_assigned_at, financials.id;
$$;

REVOKE ALL ON FUNCTION private.driver_analytics_assignment_date(timestamptz, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.driver_analytics_is_outcome_eligible(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) FROM PUBLIC;

COMMENT ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) IS
  'Canonical Driver Analytics cohort: actual assignment timestamp plus current Driver-authored outcome evidence.';
