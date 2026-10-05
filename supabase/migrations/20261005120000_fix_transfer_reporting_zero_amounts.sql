-- Keep driver analytics and cash settlement aligned with the payment method.
-- Legacy accepted Transfer deliveries may have a zero/null driver_transfer_amount
-- even though the order is a real Transfer collection. Infer the collection from
-- the order amount in the reporting projection; do not mutate historical orders.

CREATE OR REPLACE FUNCTION private.driver_analytics_reported_payment_components(
  p_order_amount numeric,
  p_payment_method text,
  p_driver_payment_method text,
  p_driver_cash_amount numeric,
  p_driver_transfer_amount numeric
)
RETURNS TABLE(cash_amount numeric, transfer_amount numeric)
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $function$
  SELECT
    GREATEST(0, CASE
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'TRANSFER' THEN 0
      WHEN p_driver_cash_amount IS NOT NULL THEN p_driver_cash_amount
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH' THEN COALESCE(p_order_amount, 0)
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH_TRANSFER'
        THEN COALESCE(p_order_amount, 0) - COALESCE(p_driver_transfer_amount, 0)
      WHEN upper(COALESCE(p_payment_method, '')) IN ('COD', 'CASH') THEN COALESCE(p_order_amount, 0)
      ELSE 0
    END)::numeric,
    GREATEST(0, CASE
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'TRANSFER'
        AND COALESCE(p_driver_transfer_amount, 0) = 0
        THEN COALESCE(p_order_amount, 0)
      WHEN COALESCE(p_driver_transfer_amount, 0) = 0
        AND upper(COALESCE(p_payment_method, '')) IN ('TRANSFER', 'BANK_TRANSFER')
        THEN COALESCE(p_order_amount, 0)
      WHEN p_driver_transfer_amount IS NOT NULL THEN p_driver_transfer_amount
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'TRANSFER' THEN COALESCE(p_order_amount, 0)
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH' THEN 0
      WHEN upper(COALESCE(p_driver_payment_method, '')) = 'CASH_TRANSFER'
        THEN COALESCE(p_order_amount, 0) - COALESCE(p_driver_cash_amount, 0)
      WHEN upper(COALESCE(p_payment_method, '')) IN ('TRANSFER', 'BANK_TRANSFER') THEN COALESCE(p_order_amount, 0)
      ELSE 0
    END)::numeric;
$function$;

REVOKE ALL ON FUNCTION private.driver_analytics_reported_payment_components(numeric, text, text, numeric, numeric) FROM PUBLIC;

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
SET search_path = public
AS $$
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
    CASE
      WHEN upper(coalesce(o.driver_payment_method::text, '')) = 'TRANSFER'
        AND coalesce(o.driver_transfer_amount, 0) = 0
      THEN CASE
        WHEN upper(coalesce(o.payment_plan::text, '')) = 'COD'
        THEN greatest(
          coalesce(private.order_cod_due_amount(o.id), 0),
          coalesce(o.cod_amount, 0),
          coalesce(o.total_amount, 0)
        )
        ELSE greatest(
          coalesce(private.order_transfer_paid_amount(o.id), 0),
          coalesce(o.total_amount, 0)
        )
      END
      ELSE coalesce(o.driver_transfer_amount, CASE WHEN upper(o.payment_method::text) IN ('TRANSFER', 'BANK_TRANSFER') THEN o.total_amount ELSE 0 END)
    END,
    o.driver_delivered_at,
    o.delivered_at,
    coalesce(o.driver_delivered_at, liability.delivered_at, o.delivered_at),
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
      OR (coalesce(o.driver_delivered_at, liability.delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR (coalesce(o.driver_delivered_at, liability.delivered_at, o.delivered_at) AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= p_date_to
    )
  ORDER BY coalesce(o.driver_delivered_at, liability.delivered_at, o.delivered_at) DESC, o.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_runner_accepted_driver_deliveries(uuid, date, date, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Pure Transfer orders use the confirmed prepayment/total as the reporting basis. A COD cap of zero must not erase them from driver analytics.
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
      LEAST(assigned_orders.cod_amount, payment.cash_amount) AS reported_cash_amount,
      CASE
        WHEN upper(COALESCE(assigned_orders.payment_plan::text, '')) = 'TRANSFER'
          OR (upper(COALESCE(assigned_orders.payment_method::text, '')) IN ('TRANSFER', 'BANK_TRANSFER')
            AND COALESCE(assigned_orders.cod_amount, 0) <= 0)
        THEN payment.transfer_amount
        ELSE LEAST(GREATEST(assigned_orders.cod_amount - payment.cash_amount, 0), payment.transfer_amount)
      END AS reported_transfer_amount
    FROM assigned_orders
    CROSS JOIN LATERAL private.driver_analytics_reported_payment_components(
      CASE
        WHEN upper(COALESCE(assigned_orders.payment_plan::text, '')) = 'TRANSFER'
          OR (upper(COALESCE(assigned_orders.payment_method::text, '')) IN ('TRANSFER', 'BANK_TRANSFER')
            AND COALESCE(assigned_orders.cod_amount, 0) <= 0)
        THEN GREATEST(
          COALESCE(private.order_transfer_paid_amount(assigned_orders.id), 0),
          COALESCE(assigned_orders.total_amount, 0)
        )
        ELSE private.order_cod_due_amount(assigned_orders.id)
      END,
      CASE WHEN assigned_orders.payment_plan = 'PARTIAL_TRANSFER_COD' THEN NULL ELSE assigned_orders.payment_method::text END,
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

REVOKE ALL ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';


