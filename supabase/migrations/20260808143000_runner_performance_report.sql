-- Canonical runner cohorts for the Finance > Overview report.
--
-- The report must not infer a runner's daily workload from order_date or from
-- driver/outcome timestamps.  Keep a small, private assignment history and
-- expose only server-side aggregate RPCs to the client.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.runner_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  runner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  effective_assignment_date DATE NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('ASSIGNED', 'REASSIGNED', 'UNASSIGNED')),
  assignment_source TEXT NOT NULL DEFAULT 'orders.runner_id',
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.runner_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_runner_assignment_history_order_latest
  ON public.runner_assignment_history (order_id, assigned_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_runner_assignment_history_runner_day
  ON public.runner_assignment_history (runner_id, effective_assignment_date, order_id);

CREATE INDEX IF NOT EXISTS idx_orders_runner_report_assignment
  ON public.orders (runner_id, runner_assigned_at, updated_at)
  WHERE runner_id IS NOT NULL;

REVOKE ALL ON TABLE public.runner_assignment_history FROM PUBLIC, anon, authenticated;

-- Seed one canonical record for existing current assignments.  This is the
-- only historical fallback available because the old schema did not retain an
-- assignment history table.
INSERT INTO public.runner_assignment_history (
  order_id,
  runner_id,
  effective_assignment_date,
  assigned_at,
  action,
  assignment_source
)
SELECT
  o.id,
  o.runner_id,
  (COALESCE(o.runner_assigned_at, o.updated_at) AT TIME ZONE 'Asia/Brunei')::date,
  COALESCE(o.runner_assigned_at, o.updated_at),
  'ASSIGNED',
  'legacy_runner_assignment'
FROM public.orders o
WHERE o.runner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.runner_assignment_history h
    WHERE h.order_id = o.id
  );

CREATE OR REPLACE FUNCTION public.record_runner_assignment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_at TIMESTAMPTZ;
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.runner_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_assigned_at := COALESCE(NEW.runner_assigned_at, now());
    NEW.runner_assigned_at := v_assigned_at;

    INSERT INTO public.runner_assignment_history (
      order_id, runner_id, effective_assignment_date, assigned_at,
      action, assignment_source, actor_id
    )
    VALUES (
      NEW.id,
      NEW.runner_id,
      (v_assigned_at AT TIME ZONE 'Asia/Brunei')::date,
      v_assigned_at,
      'ASSIGNED',
      'orders.runner_id',
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF NEW.runner_id IS NOT DISTINCT FROM OLD.runner_id THEN
    RETURN NEW;
  END IF;

  v_assigned_at := now();
  IF NEW.runner_id IS NULL THEN
    NEW.runner_assigned_at := NULL;
    v_action := 'UNASSIGNED';
  ELSE
    NEW.runner_assigned_at := v_assigned_at;
    v_action := CASE WHEN OLD.runner_id IS NULL THEN 'ASSIGNED' ELSE 'REASSIGNED' END;
  END IF;

  INSERT INTO public.runner_assignment_history (
    order_id, runner_id, effective_assignment_date, assigned_at,
    action, assignment_source, actor_id
  )
  VALUES (
    NEW.id,
    NEW.runner_id,
    (v_assigned_at AT TIME ZONE 'Asia/Brunei')::date,
    v_assigned_at,
    v_action,
    'orders.runner_id',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_runner_assignment_history ON public.orders;
CREATE TRIGGER trg_orders_runner_assignment_history
  BEFORE INSERT OR UPDATE OF runner_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.record_runner_assignment_history();

CREATE OR REPLACE FUNCTION private.get_runner_performance_cohort(
  p_runner_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE (
  order_id UUID,
  order_code TEXT,
  runner_id UUID,
  effective_assignment_date DATE,
  assignment_source TEXT,
  customer_name TEXT,
  total_amount NUMERIC,
  payment_method TEXT,
  area TEXT,
  driver_id UUID,
  driver_name TEXT,
  result TEXT,
  reason TEXT,
  reschedule_date DATE,
  cash_amount NUMERIC,
  transfer_amount NUMERIC,
  delivered_amount NUMERIC,
  is_excluded BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH latest_history AS (
  SELECT DISTINCT ON (h.order_id)
    h.order_id,
    h.runner_id,
    h.effective_assignment_date,
    h.assignment_source
  FROM public.runner_assignment_history h
  ORDER BY h.order_id, h.assigned_at DESC, h.id DESC
),
legacy_current_assignments AS (
  SELECT
    o.id AS order_id,
    o.runner_id,
    (COALESCE(o.runner_assigned_at, o.updated_at) AT TIME ZONE 'Asia/Brunei')::date AS effective_assignment_date,
    'legacy_runner_assignment'::TEXT AS assignment_source
  FROM public.orders o
  WHERE o.runner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.runner_assignment_history h
      WHERE h.order_id = o.id
    )
),
assignments AS (
  SELECT h.order_id, h.runner_id, h.effective_assignment_date, h.assignment_source
  FROM latest_history h
  WHERE h.runner_id IS NOT NULL
  UNION ALL
  SELECT l.order_id, l.runner_id, l.effective_assignment_date, l.assignment_source
  FROM legacy_current_assignments l
),
scoped AS (
  SELECT
    a.order_id,
    o.order_code,
    a.runner_id,
    a.effective_assignment_date,
    a.assignment_source,
    o.customer_name,
    o.total_amount,
    o.payment_method::TEXT AS payment_method,
    o.area,
    o.driver_id,
    dp.display_name AS driver_name,
    o.status::TEXT AS order_status,
    o.operational_status::TEXT AS operational_status,
    o.runner_status::TEXT AS runner_status,
    o.runner_accept_status::TEXT AS runner_accept_status,
    o.runner_review_status::TEXT AS runner_review_status,
    o.runner_final_outcome::TEXT AS runner_final_outcome,
    o.driver_status::TEXT AS driver_status,
    o.driver_failed_reason::TEXT AS driver_failed_reason,
    o.driver_failed_remark,
    o.failed_reason,
    o.runner_comment,
    o.next_delivery_date,
    o.driver_next_delivery_date,
    o.driver_payment_method,
    o.driver_cash_amount,
    o.driver_transfer_amount
  FROM assignments a
  JOIN public.orders o ON o.id = a.order_id
  LEFT JOIN public.profiles dp ON dp.id = o.driver_id
  WHERE a.effective_assignment_date BETWEEN p_from_date AND p_to_date
    AND (p_runner_id IS NULL OR a.runner_id = p_runner_id)
),
classified AS (
  SELECT
    s.*,
    (
      s.order_status IN ('CANCELLED', 'CANCELED')
      OR s.operational_status IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
      OR s.runner_status IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    ) AS is_excluded_row,
    CASE
      WHEN s.order_status IN ('CANCELLED', 'CANCELED')
        OR s.operational_status IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
        OR s.runner_status IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
        THEN 'EXCLUDED'
      WHEN s.runner_review_status = 'REVIEWED'
        AND s.runner_final_outcome = 'RESCHEDULE'
        THEN 'RESCHEDULED'
      WHEN s.runner_status = 'DELIVERED'
        AND s.runner_accept_status = 'ACCEPTED'
        THEN 'DELIVERED'
      WHEN s.runner_status = 'FAILED_DELIVERY'
        AND s.runner_accept_status = 'ACCEPTED'
        AND s.runner_final_outcome IS DISTINCT FROM 'RESCHEDULE'
        AND s.runner_final_outcome IS DISTINCT FROM 'NEED_SALESPERSON_FOLLOWUP'
        THEN 'FAILED'
      ELSE 'PENDING'
    END AS result_row
  FROM scoped s
),
with_amounts AS (
  SELECT
    c.*,
    CASE
      WHEN c.result_row <> 'DELIVERED' THEN 0::NUMERIC
      WHEN c.driver_cash_amount IS NOT NULL THEN GREATEST(c.driver_cash_amount, 0)
      WHEN c.driver_payment_method = 'CASH' THEN GREATEST(c.total_amount, 0)
      WHEN c.driver_payment_method = 'TRANSFER' THEN 0::NUMERIC
      WHEN c.driver_payment_method = 'CASH_TRANSFER'
        THEN GREATEST(c.total_amount - COALESCE(c.driver_transfer_amount, 0), 0)
      WHEN c.driver_payment_method IS NULL AND c.payment_method = 'COD'
        THEN GREATEST(c.total_amount, 0)
      ELSE 0::NUMERIC
    END AS cash_row,
    CASE
      WHEN c.result_row <> 'DELIVERED' THEN 0::NUMERIC
      WHEN c.driver_transfer_amount IS NOT NULL THEN GREATEST(c.driver_transfer_amount, 0)
      WHEN c.driver_payment_method = 'TRANSFER' THEN GREATEST(c.total_amount, 0)
      WHEN c.driver_payment_method = 'CASH' THEN 0::NUMERIC
      WHEN c.driver_payment_method = 'CASH_TRANSFER'
        THEN GREATEST(c.total_amount - COALESCE(c.driver_cash_amount, 0), 0)
      WHEN c.driver_payment_method IS NULL AND c.payment_method = 'TRANSFER'
        THEN GREATEST(c.total_amount, 0)
      ELSE 0::NUMERIC
    END AS transfer_row
  FROM classified c
)
SELECT
  w.order_id,
  w.order_code,
  w.runner_id,
  w.effective_assignment_date,
  w.assignment_source,
  w.customer_name,
  w.total_amount,
  w.payment_method,
  w.area,
  w.driver_id,
  w.driver_name,
  w.result_row AS result,
  CASE
    WHEN w.result_row = 'FAILED'
      THEN COALESCE(w.driver_failed_reason, w.failed_reason, w.driver_failed_remark, w.runner_comment)
    WHEN w.result_row = 'RESCHEDULED'
      THEN COALESCE(w.driver_failed_remark, w.runner_comment, 'Rescheduled delivery')
    WHEN w.result_row = 'PENDING'
      THEN CASE
        WHEN w.driver_status IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
          THEN 'Awaiting runner acceptance'
        ELSE 'No final runner outcome'
      END
    ELSE NULL
  END AS reason,
  CASE
    WHEN w.result_row = 'RESCHEDULED'
      THEN COALESCE(w.next_delivery_date, w.driver_next_delivery_date)
    ELSE NULL
  END AS reschedule_date,
  w.cash_row AS cash_amount,
  w.transfer_row AS transfer_amount,
  w.cash_row + w.transfer_row AS delivered_amount,
  w.is_excluded_row AS is_excluded
FROM with_amounts w;
$$;

CREATE OR REPLACE FUNCTION public.get_runner_performance(
  p_runner_id UUID DEFAULT NULL,
  p_from_date DATE DEFAULT ((now() AT TIME ZONE 'Asia/Brunei')::date),
  p_to_date DATE DEFAULT ((now() AT TIME ZONE 'Asia/Brunei')::date)
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
  v_target_runner_id UUID := p_runner_id;
  v_days JSONB;
  v_summary JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_role := public.get_user_role(v_actor)::TEXT;
  IF v_role = 'runner' THEN
    v_target_runner_id := v_actor;
  ELSIF v_role NOT IN ('admin', 'manager', 'finance_viewer') THEN
    RAISE EXCEPTION 'Runner performance is not available for this role';
  END IF;

  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date > p_to_date THEN
    RAISE EXCEPTION 'Invalid report date range';
  END IF;

  WITH cohort AS (
    SELECT * FROM private.get_runner_performance_cohort(v_target_runner_id, p_from_date, p_to_date)
  ),
  metrics AS (
    SELECT
      COUNT(*) FILTER (WHERE NOT is_excluded)::INT AS assigned,
      COUNT(*) FILTER (WHERE result = 'DELIVERED')::INT AS delivered,
      COUNT(*) FILTER (WHERE result = 'FAILED')::INT AS failed,
      COUNT(*) FILTER (WHERE result = 'RESCHEDULED')::INT AS rescheduled,
      COUNT(*) FILTER (WHERE result = 'PENDING')::INT AS pending,
      COUNT(*) FILTER (WHERE is_excluded)::INT AS excluded,
      COUNT(*)::INT AS cohort_total,
      COALESCE(SUM(cash_amount), 0)::NUMERIC AS cash_amount,
      COALESCE(SUM(transfer_amount), 0)::NUMERIC AS transfer_amount,
      COALESCE(SUM(delivered_amount), 0)::NUMERIC AS delivered_amount
    FROM cohort
  )
  SELECT jsonb_build_object(
    'assigned', assigned,
    'delivered', delivered,
    'failed', failed,
    'rescheduled', rescheduled,
    'pending', pending,
    'excluded', excluded,
    'cohortTotal', cohort_total,
    'cashAmount', cash_amount,
    'transferAmount', transfer_amount,
    'deliveredAmount', delivered_amount,
    'deliveryRate', CASE WHEN assigned = 0 THEN 0 ELSE ROUND((delivered::NUMERIC / assigned) * 100, 2) END,
    'reconciliationOk', cohort_total = delivered + failed + rescheduled + pending + excluded
  )
  INTO v_summary
  FROM metrics;

  WITH calendar AS (
    SELECT generate_series(p_from_date, p_to_date, INTERVAL '1 day')::date AS report_date
  ),
  cohort AS (
    SELECT * FROM private.get_runner_performance_cohort(v_target_runner_id, p_from_date, p_to_date)
  ),
  day_metrics AS (
    SELECT
      c.report_date,
      COUNT(o.order_id) FILTER (WHERE NOT o.is_excluded)::INT AS assigned,
      COUNT(o.order_id) FILTER (WHERE o.result = 'DELIVERED')::INT AS delivered,
      COUNT(o.order_id) FILTER (WHERE o.result = 'FAILED')::INT AS failed,
      COUNT(o.order_id) FILTER (WHERE o.result = 'RESCHEDULED')::INT AS rescheduled,
      COUNT(o.order_id) FILTER (WHERE o.result = 'PENDING')::INT AS pending,
      COUNT(o.order_id) FILTER (WHERE o.is_excluded)::INT AS excluded,
      COUNT(o.order_id)::INT AS cohort_total,
      COALESCE(SUM(o.cash_amount), 0)::NUMERIC AS cash_amount,
      COALESCE(SUM(o.transfer_amount), 0)::NUMERIC AS transfer_amount,
      COALESCE(SUM(o.delivered_amount), 0)::NUMERIC AS delivered_amount
    FROM calendar c
    LEFT JOIN cohort o ON o.effective_assignment_date = c.report_date
    GROUP BY c.report_date
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'date', report_date,
        'assigned', assigned,
        'delivered', delivered,
        'failed', failed,
        'rescheduled', rescheduled,
        'pending', pending,
        'excluded', excluded,
        'cohortTotal', cohort_total,
        'cashAmount', cash_amount,
        'transferAmount', transfer_amount,
        'deliveredAmount', delivered_amount,
        'deliveryRate', CASE WHEN assigned = 0 THEN 0 ELSE ROUND((delivered::NUMERIC / assigned) * 100, 2) END,
        'reconciliationOk', cohort_total = delivered + failed + rescheduled + pending + excluded
      )
      ORDER BY report_date
    ),
    '[]'::jsonb
  )
  INTO v_days
  FROM day_metrics;

  RETURN jsonb_build_object(
    'timeZone', 'Asia/Brunei',
    'fromDate', p_from_date,
    'toDate', p_to_date,
    'runnerId', v_target_runner_id,
    'summary', v_summary,
    'days', v_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_runner_performance_day(
  p_runner_id UUID,
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
  v_target_runner_id UUID := p_runner_id;
  v_summary JSONB;
  v_orders JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_role := public.get_user_role(v_actor)::TEXT;
  IF v_role = 'runner' THEN
    v_target_runner_id := v_actor;
  ELSIF v_role NOT IN ('admin', 'manager', 'finance_viewer') THEN
    RAISE EXCEPTION 'Runner performance is not available for this role';
  END IF;

  WITH cohort AS (
    SELECT * FROM private.get_runner_performance_cohort(v_target_runner_id, p_date, p_date)
  )
  SELECT jsonb_build_object(
    'assigned', COUNT(*) FILTER (WHERE NOT is_excluded)::INT,
    'delivered', COUNT(*) FILTER (WHERE result = 'DELIVERED')::INT,
    'failed', COUNT(*) FILTER (WHERE result = 'FAILED')::INT,
    'rescheduled', COUNT(*) FILTER (WHERE result = 'RESCHEDULED')::INT,
    'pending', COUNT(*) FILTER (WHERE result = 'PENDING')::INT,
    'excluded', COUNT(*) FILTER (WHERE is_excluded)::INT,
    'cohortTotal', COUNT(*)::INT,
    'cashAmount', COALESCE(SUM(cash_amount), 0),
    'transferAmount', COALESCE(SUM(transfer_amount), 0),
    'deliveredAmount', COALESCE(SUM(delivered_amount), 0),
    'deliveryRate', CASE
      WHEN COUNT(*) FILTER (WHERE NOT is_excluded) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE result = 'DELIVERED')::NUMERIC / COUNT(*) FILTER (WHERE NOT is_excluded)) * 100, 2)
    END,
    'reconciliationOk', COUNT(*) =
      COUNT(*) FILTER (WHERE result = 'DELIVERED')
      + COUNT(*) FILTER (WHERE result = 'FAILED')
      + COUNT(*) FILTER (WHERE result = 'RESCHEDULED')
      + COUNT(*) FILTER (WHERE result = 'PENDING')
      + COUNT(*) FILTER (WHERE is_excluded)
  )
  INTO v_summary
  FROM cohort;

  WITH cohort AS (
    SELECT * FROM private.get_runner_performance_cohort(v_target_runner_id, p_date, p_date)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'orderId', order_id,
        'orderCode', order_code,
        'customerName', customer_name,
        'area', area,
        'totalAmount', total_amount,
        'paymentMethod', payment_method,
        'driverId', driver_id,
        'driverName', driver_name,
        'result', result,
        'reason', reason,
        'rescheduleDate', reschedule_date,
        'cashAmount', cash_amount,
        'transferAmount', transfer_amount,
        'deliveredAmount', delivered_amount,
        'effectiveAssignmentDate', effective_assignment_date,
        'assignmentSource', assignment_source,
        'isExcluded', is_excluded
      )
      ORDER BY result, order_code
    ),
    '[]'::jsonb
  )
  INTO v_orders
  FROM cohort;

  RETURN jsonb_build_object(
    'timeZone', 'Asia/Brunei',
    'date', p_date,
    'runnerId', v_target_runner_id,
    'summary', v_summary,
    'orders', v_orders
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_runner_performance(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_runner_performance_day(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_runner_performance(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_runner_performance_day(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_runner_performance(UUID, DATE, DATE)
  IS 'Server-side canonical Runner assignment cohort performance aggregate in Asia/Brunei.';
COMMENT ON FUNCTION public.get_runner_performance_day(UUID, DATE)
  IS 'Selected-day detail for the canonical Runner assignment cohort.';
