-- Finance Overview reporting only.
-- This migration does not change order lifecycle state.  It gives Finance a
-- server-side report over the same Delivered and Action Required predicates
-- used by the Orders screens.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.finance_scoped_orders(
  p_runner_id UUID,
  p_area TEXT,
  p_visible_owner_ids UUID[]
)
RETURNS TABLE (
  id UUID,
  order_code TEXT,
  customer_name TEXT,
  area TEXT,
  total_amount NUMERIC,
  payment_method TEXT,
  status TEXT,
  runner_status TEXT,
  runner_id UUID,
  salesperson_id UUID,
  salesperson_action_required BOOLEAN,
  next_delivery_date DATE,
  driver_next_delivery_date DATE,
  salesperson_action_type TEXT,
  runner_final_outcome TEXT,
  runner_failed_reason_id UUID,
  runner_comment TEXT,
  driver_failed_reason TEXT,
  driver_failed_remark TEXT,
  failed_reason TEXT,
  driver_failed_at TIMESTAMPTZ,
  runner_reviewed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  runner_accept_status TEXT,
  driver_status TEXT,
  driver_payment_method TEXT,
  driver_cash_amount NUMERIC,
  driver_transfer_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    o.id,
    o.order_code,
    o.customer_name,
    o.area,
    o.total_amount,
    o.payment_method::TEXT,
    o.status::TEXT,
    o.runner_status::TEXT,
    o.runner_id,
    o.salesperson_id,
    o.salesperson_action_required,
    o.next_delivery_date,
    o.driver_next_delivery_date,
    o.salesperson_action_type,
    o.runner_final_outcome,
    o.runner_failed_reason_id,
    o.runner_comment,
    o.driver_failed_reason,
    o.driver_failed_remark,
    o.failed_reason,
    o.driver_failed_at,
    o.runner_reviewed_at,
    o.delivered_at,
    o.runner_accept_status::TEXT,
    o.driver_status::TEXT,
    o.driver_payment_method::TEXT,
    o.driver_cash_amount,
    o.driver_transfer_amount
  FROM public.orders o
  WHERE o.status::TEXT NOT IN ('CANCELLED', 'CANCELED')
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_area IS NULL OR o.area = p_area)
    AND (p_visible_owner_ids IS NULL OR o.salesperson_id = ANY(p_visible_owner_ids))
$$;

CREATE OR REPLACE FUNCTION private.finance_action_events(
  p_runner_id UUID,
  p_area TEXT,
  p_visible_owner_ids UUID[],
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  order_id UUID,
  event_id UUID,
  order_code TEXT,
  customer_name TEXT,
  area TEXT,
  total_amount NUMERIC,
  payment_method TEXT,
  runner_id UUID,
  classification TEXT,
  source TEXT,
  event_date DATE,
  event_at TIMESTAMPTZ,
  reason TEXT,
  reschedule_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH scoped AS (
  SELECT *
  FROM private.finance_scoped_orders(p_runner_id, p_area, p_visible_owner_ids)
),
history_scoped AS (
  SELECT s.*
  FROM private.finance_scoped_orders(NULL, p_area, p_visible_owner_ids) s
  WHERE p_runner_id IS NULL
    OR s.runner_id = p_runner_id
    OR EXISTS (
      SELECT 1
      FROM public.runner_assignment_history ah
      WHERE ah.order_id = s.id
        AND ah.runner_id = p_runner_id
    )
),
current_action AS (
  SELECT
    s.*,
    CASE
      WHEN s.next_delivery_date IS NOT NULL
        OR s.driver_next_delivery_date IS NOT NULL
        OR s.salesperson_action_type = 'RESCHEDULE_DELIVERY'
        OR s.runner_final_outcome = 'RESCHEDULE'
        OR lower(COALESCE(s.driver_failed_reason, '')) IN (
          'delivery tomorrow', 'customer requested reschedule', 'customer reschedule'
        ) THEN 'RESCHEDULED'
      WHEN s.runner_status = 'FAILED_DELIVERY' THEN 'FAILED_DELIVERY'
      WHEN s.runner_failed_reason_id IS NOT NULL OR s.runner_comment IS NOT NULL THEN 'RUNNER_FLAGGED'
      ELSE 'MANUAL'
    END AS classification,
    rh.rescheduled_at AS latest_rescheduled_at
  FROM scoped s
  LEFT JOIN LATERAL (
    SELECT h.rescheduled_at
    FROM public.reschedule_history h
    WHERE h.order_id = s.id
      AND h.to_status::TEXT NOT IN ('CANCELLED', 'CANCELED')
    ORDER BY h.rescheduled_at DESC, h.id DESC
    LIMIT 1
  ) rh ON true
  WHERE (
    (s.salesperson_action_required = true AND s.runner_status <> 'DELIVERED')
    OR (s.runner_status = 'FAILED_DELIVERY' AND s.status = 'READY')
  )
),
current_events AS (
  SELECT
    c.id AS order_id,
    c.id AS event_id,
    c.order_code,
    c.customer_name,
    c.area,
    c.total_amount,
    c.payment_method,
    c.runner_id,
    c.classification,
    'CURRENT_ACTION'::TEXT AS source,
    (
      CASE WHEN c.classification = 'RESCHEDULED'
        THEN COALESCE(c.latest_rescheduled_at, c.runner_reviewed_at, c.driver_failed_at)
        ELSE COALESCE(c.driver_failed_at, c.runner_reviewed_at)
      END AT TIME ZONE 'Asia/Brunei'
    )::DATE AS event_date,
    CASE WHEN c.classification = 'RESCHEDULED'
      THEN COALESCE(c.latest_rescheduled_at, c.runner_reviewed_at, c.driver_failed_at)
      ELSE COALESCE(c.driver_failed_at, c.runner_reviewed_at)
    END AS event_at,
    COALESCE(c.driver_failed_reason, c.failed_reason, c.driver_failed_remark, c.runner_comment) AS reason,
    COALESCE(c.next_delivery_date, c.driver_next_delivery_date) AS reschedule_date
  FROM current_action c
),
reschedule_history_events AS (
  SELECT
    s.id AS order_id,
    h.id AS event_id,
    s.order_code,
    s.customer_name,
    s.area,
    s.total_amount,
    s.payment_method,
    s.runner_id,
    'RESCHEDULED'::TEXT AS classification,
    'RESCHEDULE_HISTORY'::TEXT AS source,
    (h.rescheduled_at AT TIME ZONE 'Asia/Brunei')::DATE AS event_date,
    h.rescheduled_at AS event_at,
    COALESCE(h.comment, 'Rescheduled delivery') AS reason,
    h.next_delivery_date AS reschedule_date
  FROM public.reschedule_history h
  JOIN history_scoped s ON s.id = h.order_id
  WHERE h.to_status::TEXT NOT IN ('CANCELLED', 'CANCELED')
),
failed_audit_events AS (
  SELECT DISTINCT ON (a.entity_id, (a.created_at AT TIME ZONE 'Asia/Brunei')::DATE)
    s.id AS order_id,
    a.id AS event_id,
    s.order_code,
    s.customer_name,
    s.area,
    s.total_amount,
    s.payment_method,
    s.runner_id,
    'FAILED_DELIVERY'::TEXT AS classification,
    'ORDER_AUDIT'::TEXT AS source,
    (a.created_at AT TIME ZONE 'Asia/Brunei')::DATE AS event_date,
    a.created_at AS event_at,
    COALESCE(
      a.after_json ->> 'driver_failed_reason',
      a.after_json ->> 'failed_reason',
      a.after_json ->> 'driver_failed_remark',
      a.after_json ->> 'runner_comment',
      a.action
    ) AS reason,
    NULL::DATE AS reschedule_date
  FROM public.audit_logs a
  JOIN history_scoped s ON s.id = a.entity_id
  WHERE a.entity_type = 'order'
    AND (
      a.after_json ->> 'runner_status' = 'FAILED_DELIVERY'
      OR a.after_json ->> 'driver_status' = 'DRIVER_FAILED'
    )
    AND lower(a.action) NOT LIKE '%resched%'
  ORDER BY a.entity_id, (a.created_at AT TIME ZONE 'Asia/Brunei')::DATE, a.created_at DESC, a.id DESC
),
all_events AS (
  SELECT * FROM current_events
  UNION ALL
  SELECT * FROM reschedule_history_events h
  WHERE NOT EXISTS (
    SELECT 1 FROM current_events c
    WHERE c.order_id = h.order_id
      AND c.classification = h.classification
      AND c.event_date = h.event_date
  )
  UNION ALL
  SELECT * FROM failed_audit_events h
  WHERE NOT EXISTS (
    SELECT 1 FROM current_events c
    WHERE c.order_id = h.order_id
      AND c.classification = h.classification
      AND c.event_date = h.event_date
  )
)
SELECT e.*
FROM all_events e
WHERE e.event_date BETWEEN p_from_date AND p_to_date
$$;

CREATE OR REPLACE FUNCTION public.get_finance_overview_areas()
RETURNS TABLE (area TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_visible_owner_ids UUID[];
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_role := public.get_user_role(v_actor)::TEXT;
  IF v_role NOT IN ('admin', 'manager', 'finance_viewer', 'runner') THEN
    RAISE EXCEPTION 'Finance overview is not available for this role';
  END IF;
  v_visible_owner_ids := public.get_visible_owner_ids();
  RETURN QUERY
  SELECT DISTINCT o.area
  FROM public.orders o
  WHERE o.area IS NOT NULL
    AND o.status::TEXT NOT IN ('CANCELLED', 'CANCELED')
    AND (v_role <> 'runner' OR o.runner_id = v_actor)
    AND (v_visible_owner_ids IS NULL OR o.salesperson_id = ANY(v_visible_owner_ids))
  ORDER BY o.area;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_overview_runners()
RETURNS TABLE (id UUID, display_name TEXT, email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_role := public.get_user_role(v_actor)::TEXT;
  IF v_role NOT IN ('admin', 'manager', 'finance_viewer', 'runner') THEN
    RAISE EXCEPTION 'Finance overview is not available for this role';
  END IF;
  RETURN QUERY
  SELECT p.id, p.display_name, p.email
  FROM public.profiles p
  WHERE p.role::TEXT = 'runner'
    AND (
      v_role IN ('admin', 'finance_viewer')
      OR p.id = v_actor
      OR (v_role = 'manager' AND EXISTS (
        SELECT 1 FROM public.manager_runner_bindings b
        WHERE b.manager_id = v_actor AND b.runner_id = p.id
      ))
    )
  ORDER BY p.display_name NULLS LAST, p.email;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_overview_report(
  p_runner_id UUID DEFAULT NULL,
  p_area TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT ((now() AT TIME ZONE 'Asia/Brunei')::DATE),
  p_to_date DATE DEFAULT ((now() AT TIME ZONE 'Asia/Brunei')::DATE)
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_runner_id UUID := p_runner_id;
  v_visible_owner_ids UUID[];
  v_summary JSONB;
  v_days JSONB;
  v_open JSONB;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_role := public.get_user_role(v_actor)::TEXT;
  IF v_role = 'runner' THEN
    v_runner_id := v_actor;
  ELSIF v_role NOT IN ('admin', 'manager', 'finance_viewer') THEN
    RAISE EXCEPTION 'Finance overview is not available for this role';
  END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date > p_to_date THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;
  IF v_role = 'manager' AND v_runner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.manager_runner_bindings b
    WHERE b.manager_id = v_actor AND b.runner_id = v_runner_id
  ) THEN
    RAISE EXCEPTION 'Runner is outside your reporting scope';
  END IF;
  v_visible_owner_ids := public.get_visible_owner_ids();

  WITH scoped AS (
    SELECT * FROM private.finance_scoped_orders(v_runner_id, p_area, v_visible_owner_ids)
  ),
  history_scoped AS (
    SELECT s.*
    FROM private.finance_scoped_orders(NULL, p_area, v_visible_owner_ids) s
    WHERE v_runner_id IS NULL
      OR s.runner_id = v_runner_id
      OR EXISTS (
        SELECT 1
        FROM public.runner_assignment_history ah
        WHERE ah.order_id = s.id
          AND ah.runner_id = v_runner_id
      )
  ),
  assigned AS (
    SELECT COUNT(DISTINCT h.order_id)::INT AS value
    FROM public.runner_assignment_history h
    JOIN history_scoped s ON s.id = h.order_id
    WHERE h.action IN ('ASSIGNED', 'REASSIGNED')
      AND (v_runner_id IS NULL OR h.runner_id = v_runner_id)
      AND h.effective_assignment_date BETWEEN p_from_date AND p_to_date
  ),
  delivered AS (
    SELECT
      COUNT(DISTINCT s.id)::INT AS value,
      COALESCE(SUM(s.total_amount), 0)::NUMERIC AS amount,
      COUNT(DISTINCT s.id) FILTER (WHERE s.payment_method = 'COD')::INT AS cod_count,
      COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'COD'), 0)::NUMERIC AS cod_amount,
      COUNT(DISTINCT s.id) FILTER (WHERE s.payment_method = 'TRANSFER')::INT AS transfer_count,
      COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'TRANSFER'), 0)::NUMERIC AS transfer_amount
    FROM scoped s
    WHERE s.runner_status = 'DELIVERED'
      AND s.delivered_at IS NOT NULL
      AND (s.delivered_at AT TIME ZONE 'Asia/Brunei')::DATE BETWEEN p_from_date AND p_to_date
  ),
  actions AS (
    SELECT * FROM private.finance_action_events(v_runner_id, p_area, v_visible_owner_ids, p_from_date, p_to_date)
  ),
  action_counts AS (
    SELECT
      COUNT(DISTINCT order_id) FILTER (WHERE classification = 'FAILED_DELIVERY')::INT AS failed,
      COUNT(DISTINCT order_id) FILTER (WHERE classification = 'RESCHEDULED')::INT AS rescheduled,
      COUNT(DISTINCT order_id) FILTER (WHERE classification IN ('RUNNER_FLAGGED', 'MANUAL'))::INT AS other_action
    FROM actions
  )
  SELECT jsonb_build_object(
    'assigned', assigned.value,
    'delivered', delivered.value,
    'failed', action_counts.failed,
    'rescheduled', action_counts.rescheduled,
    'otherActionRequired', action_counts.other_action,
    'deliveredAmount', delivered.amount,
    'codCount', delivered.cod_count,
    'codAmount', delivered.cod_amount,
    'transferCount', delivered.transfer_count,
    'transferAmount', delivered.transfer_amount
  )
  INTO v_summary
  FROM assigned, delivered, action_counts;

  WITH calendar AS (
    SELECT generate_series(p_from_date, p_to_date, INTERVAL '1 day')::DATE AS report_date
  ),
  scoped AS (
    SELECT * FROM private.finance_scoped_orders(v_runner_id, p_area, v_visible_owner_ids)
  ),
  history_scoped AS (
    SELECT s.*
    FROM private.finance_scoped_orders(NULL, p_area, v_visible_owner_ids) s
    WHERE v_runner_id IS NULL
      OR s.runner_id = v_runner_id
      OR EXISTS (
        SELECT 1
        FROM public.runner_assignment_history ah
        WHERE ah.order_id = s.id
          AND ah.runner_id = v_runner_id
      )
  ),
  assignments AS (
    SELECT h.effective_assignment_date AS report_date, COUNT(DISTINCT h.order_id)::INT AS value
    FROM public.runner_assignment_history h
    JOIN history_scoped s ON s.id = h.order_id
    WHERE h.action IN ('ASSIGNED', 'REASSIGNED')
      AND (v_runner_id IS NULL OR h.runner_id = v_runner_id)
      AND h.effective_assignment_date BETWEEN p_from_date AND p_to_date
    GROUP BY h.effective_assignment_date
  ),
  deliveries AS (
    SELECT (s.delivered_at AT TIME ZONE 'Asia/Brunei')::DATE AS report_date,
      COUNT(DISTINCT s.id)::INT AS value,
      COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'COD'), 0)::NUMERIC AS cod_amount,
      COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'TRANSFER'), 0)::NUMERIC AS transfer_amount
    FROM scoped s
    WHERE s.runner_status = 'DELIVERED' AND s.delivered_at IS NOT NULL
      AND (s.delivered_at AT TIME ZONE 'Asia/Brunei')::DATE BETWEEN p_from_date AND p_to_date
    GROUP BY (s.delivered_at AT TIME ZONE 'Asia/Brunei')::DATE
  ),
  actions AS (
    SELECT event_date AS report_date,
      COUNT(DISTINCT order_id) FILTER (WHERE classification = 'FAILED_DELIVERY')::INT AS failed,
      COUNT(DISTINCT order_id) FILTER (WHERE classification = 'RESCHEDULED')::INT AS rescheduled,
      COUNT(DISTINCT order_id) FILTER (WHERE classification IN ('RUNNER_FLAGGED', 'MANUAL'))::INT AS other_action
    FROM private.finance_action_events(v_runner_id, p_area, v_visible_owner_ids, p_from_date, p_to_date)
    GROUP BY event_date
  ),
  rows AS (
    SELECT c.report_date,
      COALESCE(a.value, 0) AS assigned,
      COALESCE(d.value, 0) AS delivered,
      COALESCE(x.failed, 0) AS failed,
      COALESCE(x.rescheduled, 0) AS rescheduled,
      COALESCE(x.other_action, 0) AS other_action,
      COALESCE(d.cod_amount, 0) AS cod_amount,
      COALESCE(d.transfer_amount, 0) AS transfer_amount
    FROM calendar c
    LEFT JOIN assignments a ON a.report_date = c.report_date
    LEFT JOIN deliveries d ON d.report_date = c.report_date
    LEFT JOIN actions x ON x.report_date = c.report_date
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', report_date,
    'assigned', assigned,
    'delivered', delivered,
    'failed', failed,
    'rescheduled', rescheduled,
    'otherActionRequired', other_action,
    'codAmount', cod_amount,
    'transferAmount', transfer_amount
  ) ORDER BY report_date), '[]'::JSONB)
  INTO v_days
  FROM rows;

  WITH scoped AS (
    SELECT * FROM private.finance_scoped_orders(v_runner_id, p_area, v_visible_owner_ids)
  ), buckets AS (
    SELECT CASE
      WHEN s.runner_status IN ('DELIVERED', 'FAILED_DELIVERY')
        AND s.runner_accept_status IS DISTINCT FROM 'ACCEPTED' THEN 'awaitingRunnerAcceptance'
      WHEN s.next_delivery_date > (now() AT TIME ZONE 'Asia/Brunei')::DATE THEN 'futureScheduled'
      WHEN s.status = 'BOOKING' THEN 'booking'
      WHEN s.status = 'READY' AND s.runner_id IS NULL THEN 'ready'
      WHEN s.runner_id IS NOT NULL THEN 'assignedDelivery'
      ELSE 'otherUnresolved'
    END AS bucket
    FROM scoped s
    WHERE NOT (s.runner_status = 'DELIVERED')
  )
  SELECT jsonb_build_object(
    'total', COUNT(*)::INT,
    'booking', COUNT(*) FILTER (WHERE bucket = 'booking')::INT,
    'ready', COUNT(*) FILTER (WHERE bucket = 'ready')::INT,
    'assignedDelivery', COUNT(*) FILTER (WHERE bucket = 'assignedDelivery')::INT,
    'awaitingRunnerAcceptance', COUNT(*) FILTER (WHERE bucket = 'awaitingRunnerAcceptance')::INT,
    'futureScheduled', COUNT(*) FILTER (WHERE bucket = 'futureScheduled')::INT,
    'otherUnresolved', COUNT(*) FILTER (WHERE bucket = 'otherUnresolved')::INT
  ) INTO v_open FROM buckets;

  RETURN jsonb_build_object(
    'timeZone', 'Asia/Brunei',
    'fromDate', p_from_date,
    'toDate', p_to_date,
    'runnerId', v_runner_id,
    'area', p_area,
    'summary', v_summary || jsonb_build_object('openCurrent', v_open -> 'total'),
    'open', v_open,
    'days', v_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_finance_overview_day(
  p_runner_id UUID,
  p_area TEXT,
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT;
  v_runner_id UUID := p_runner_id;
  v_visible_owner_ids UUID[];
  v_orders JSONB;
  v_summary JSONB;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  v_role := public.get_user_role(v_actor)::TEXT;
  IF v_role = 'runner' THEN v_runner_id := v_actor;
  ELSIF v_role NOT IN ('admin', 'manager', 'finance_viewer') THEN RAISE EXCEPTION 'Finance overview is not available for this role'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Invalid report date'; END IF;
  IF v_role = 'manager' AND v_runner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.manager_runner_bindings b WHERE b.manager_id = v_actor AND b.runner_id = v_runner_id
  ) THEN RAISE EXCEPTION 'Runner is outside your reporting scope'; END IF;
  v_visible_owner_ids := public.get_visible_owner_ids();

  WITH scoped AS (
    SELECT * FROM private.finance_scoped_orders(v_runner_id, p_area, v_visible_owner_ids)
  ),
  history_scoped AS (
    SELECT s.*
    FROM private.finance_scoped_orders(NULL, p_area, v_visible_owner_ids) s
    WHERE v_runner_id IS NULL
      OR s.runner_id = v_runner_id
      OR EXISTS (
        SELECT 1
        FROM public.runner_assignment_history ah
        WHERE ah.order_id = s.id
          AND ah.runner_id = v_runner_id
      )
  ),
  assigned AS (
    SELECT COUNT(DISTINCT h.order_id)::INT AS value
    FROM public.runner_assignment_history h
    JOIN history_scoped s ON s.id = h.order_id
    WHERE h.action IN ('ASSIGNED', 'REASSIGNED')
      AND (v_runner_id IS NULL OR h.runner_id = v_runner_id)
      AND h.effective_assignment_date = p_date
  ),
  delivered AS (
    SELECT COUNT(DISTINCT s.id)::INT AS value,
      COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'COD'), 0)::NUMERIC AS cod_amount,
      COALESCE(SUM(s.total_amount) FILTER (WHERE s.payment_method = 'TRANSFER'), 0)::NUMERIC AS transfer_amount
    FROM scoped s WHERE s.runner_status = 'DELIVERED' AND s.delivered_at IS NOT NULL
      AND (s.delivered_at AT TIME ZONE 'Asia/Brunei')::DATE = p_date
  ),
  actions AS (
    SELECT * FROM private.finance_action_events(v_runner_id, p_area, v_visible_owner_ids, p_date, p_date)
  )
  SELECT jsonb_build_object(
    'assigned', assigned.value,
    'delivered', delivered.value,
    'failed', COUNT(DISTINCT actions.order_id) FILTER (WHERE actions.classification = 'FAILED_DELIVERY')::INT,
    'rescheduled', COUNT(DISTINCT actions.order_id) FILTER (WHERE actions.classification = 'RESCHEDULED')::INT,
    'otherActionRequired', COUNT(DISTINCT actions.order_id) FILTER (WHERE actions.classification IN ('RUNNER_FLAGGED', 'MANUAL'))::INT,
    'codAmount', delivered.cod_amount,
    'transferAmount', delivered.transfer_amount
  ) INTO v_summary
  FROM assigned, delivered CROSS JOIN actions;

  WITH scoped AS (
    SELECT * FROM private.finance_scoped_orders(v_runner_id, p_area, v_visible_owner_ids)
  ),
  history_scoped AS (
    SELECT s.*
    FROM private.finance_scoped_orders(NULL, p_area, v_visible_owner_ids) s
    WHERE v_runner_id IS NULL
      OR s.runner_id = v_runner_id
      OR EXISTS (
        SELECT 1
        FROM public.runner_assignment_history ah
        WHERE ah.order_id = s.id
          AND ah.runner_id = v_runner_id
      )
  ),
  assigned_rows AS (
    SELECT s.*, 'ASSIGNED'::TEXT AS classification, 'ASSIGNMENT_HISTORY'::TEXT AS source,
      h.effective_assignment_date AS event_date, NULL::TEXT AS reason, NULL::DATE AS reschedule_date
    FROM public.runner_assignment_history h
    JOIN history_scoped s ON s.id = h.order_id
    WHERE h.action IN ('ASSIGNED', 'REASSIGNED')
      AND (v_runner_id IS NULL OR h.runner_id = v_runner_id)
      AND h.effective_assignment_date = p_date
  ),
  delivered_rows AS (
    SELECT s.*, 'DELIVERED'::TEXT AS classification, 'DELIVERED_ORDERS'::TEXT AS source,
      (s.delivered_at AT TIME ZONE 'Asia/Brunei')::DATE AS event_date, NULL::TEXT AS reason, NULL::DATE AS reschedule_date
    FROM scoped s WHERE s.runner_status = 'DELIVERED' AND s.delivered_at IS NOT NULL
      AND (s.delivered_at AT TIME ZONE 'Asia/Brunei')::DATE = p_date
  ),
  action_rows AS (
    SELECT e.order_id, e.event_id, e.order_code, e.customer_name, e.area, e.total_amount,
      e.payment_method, e.runner_id, e.classification, e.source, e.event_date, e.reason, e.reschedule_date
    FROM private.finance_action_events(v_runner_id, p_area, v_visible_owner_ids, p_date, p_date) e
  ),
  all_rows AS (
    SELECT id AS order_id, id AS event_id, order_code, customer_name, area, total_amount, payment_method, runner_id, classification, source, event_date, reason, reschedule_date FROM assigned_rows
    UNION ALL
    SELECT id, id, order_code, customer_name, area, total_amount, payment_method, runner_id, classification, source, event_date, reason, reschedule_date FROM delivered_rows
    UNION ALL
    SELECT order_id, event_id, order_code, customer_name, area, total_amount, payment_method, runner_id, classification, source, event_date, reason, reschedule_date FROM action_rows
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'orderId', order_id,
    'eventId', event_id,
    'orderCode', order_code,
    'customerName', customer_name,
    'area', area,
    'totalAmount', total_amount,
    'paymentMethod', payment_method,
    'runnerId', runner_id,
    'classification', classification,
    'source', source,
    'eventDate', event_date,
    'reason', reason,
    'rescheduleDate', reschedule_date
  ) ORDER BY classification, order_code, event_id), '[]'::JSONB)
  INTO v_orders
  FROM all_rows;

  RETURN jsonb_build_object('timeZone', 'Asia/Brunei', 'date', p_date, 'runnerId', v_runner_id, 'area', p_area, 'summary', v_summary, 'orders', v_orders);
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_overview_areas() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_finance_overview_runners() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_finance_overview_report(UUID, TEXT, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_finance_overview_day(UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_overview_areas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finance_overview_runners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finance_overview_report(UUID, TEXT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finance_overview_day(UUID, TEXT, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_finance_overview_report(UUID, TEXT, DATE, DATE)
  IS 'Canonical Finance Overview aggregation. Delivered uses runner_status=DELIVERED and delivered_at; Action Required uses the Orders tab predicate and immutable reschedule/audit events.';
