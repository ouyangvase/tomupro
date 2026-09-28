-- One order has one authoritative current operational state.
-- Historical delivery attempts, reschedules, and audit rows remain unchanged.

CREATE OR REPLACE FUNCTION private.order_current_operational_state(
  p_status text,
  p_operational_status text,
  p_runner_status text,
  p_runner_review_status text,
  p_runner_final_outcome text,
  p_salesperson_action_required boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN upper(coalesce(p_status, '')) = 'CANCELLED'
      OR upper(coalesce(p_operational_status, '')) IN ('CANCELLED', 'RETURNED', 'REFUNDED')
      OR upper(coalesce(p_runner_status, '')) IN ('CANCELLED', 'RETURNED', 'REFUNDED')
      THEN 'CANCELLED'
    WHEN upper(coalesce(p_runner_status, '')) = 'DELIVERED'
      OR upper(coalesce(p_operational_status, '')) = 'DELIVERED_FINAL'
      THEN 'DELIVERED'
    WHEN coalesce(p_salesperson_action_required, false)
      OR upper(coalesce(p_runner_review_status, '')) = 'ACTION_REQUIRED'
      OR upper(coalesce(p_runner_final_outcome, '')) = 'NEED_SALESPERSON_FOLLOWUP'
      OR (
        upper(coalesce(p_runner_status, '')) = 'FAILED_DELIVERY'
        AND upper(coalesce(p_status, '')) = 'READY'
      )
      THEN 'ACTION_REQUIRED'
    WHEN upper(coalesce(p_status, '')) = 'BOOKING'
      OR upper(coalesce(p_operational_status, '')) IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE', 'BOOKING_MANUAL')
      THEN 'BOOKING'
    WHEN upper(coalesce(p_status, '')) = 'READY'
      THEN 'READY'
    ELSE 'BOOKING'
  END;
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS current_operational_state text
;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_current_operational_state_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_current_operational_state_check
  CHECK (current_operational_state IN ('BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_orders_current_operational_state_updated
  ON public.orders (current_operational_state, updated_at DESC);

CREATE OR REPLACE FUNCTION private.enforce_final_order_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  -- Final states cannot retain an active salesperson action marker. The
  -- original delivery/reschedule/audit records are intentionally untouched.
  IF upper(coalesce(NEW.status::text, '')) = 'CANCELLED'
    OR upper(coalesce(NEW.operational_status, '')) IN ('CANCELLED', 'RETURNED', 'REFUNDED')
    OR upper(coalesce(NEW.runner_status::text, '')) IN ('CANCELLED', 'RETURNED', 'REFUNDED', 'DELIVERED')
    OR upper(coalesce(NEW.operational_status, '')) = 'DELIVERED_FINAL'
  THEN
    NEW.salesperson_action_required := false;
    NEW.salesperson_action_type := NULL;
    NEW.salesperson_action_due_date := NULL;
    IF upper(coalesce(NEW.runner_status::text, '')) IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED')
      OR upper(coalesce(NEW.operational_status, '')) IN ('DELIVERED_FINAL', 'CANCELLED', 'RETURNED', 'REFUNDED')
    THEN
      NEW.runner_review_status := CASE
        WHEN upper(coalesce(NEW.runner_status::text, '')) = 'DELIVERED' THEN 'REVIEWED'
        ELSE NEW.runner_review_status
      END;
    END IF;
  END IF;
  NEW.current_operational_state := private.order_current_operational_state(
    NEW.status::text,
    NEW.operational_status,
    NEW.runner_status::text,
    NEW.runner_review_status,
    NEW.runner_final_outcome,
    NEW.salesperson_action_required
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_final_order_lifecycle ON public.orders;
CREATE TRIGGER enforce_final_order_lifecycle
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.enforce_final_order_lifecycle();

UPDATE public.orders
SET current_operational_state = private.order_current_operational_state(
  status::text,
  operational_status,
  runner_status::text,
  runner_review_status,
  runner_final_outcome,
  salesperson_action_required
);

ALTER TABLE public.orders
  ALTER COLUMN current_operational_state SET NOT NULL;

-- Remove only stale action markers from orders already in a final state. This
-- is the actual safe repair; no stock, cash, driver, proof, Telegram, or
-- historical row is changed.
WITH stale_final_actions AS (
  SELECT id, current_operational_state, salesperson_action_required,
         salesperson_action_type, salesperson_action_due_date
  FROM public.orders
  WHERE current_operational_state IN ('DELIVERED', 'CANCELLED')
    AND (
      salesperson_action_required IS TRUE
      OR salesperson_action_type IS NOT NULL
      OR salesperson_action_due_date IS NOT NULL
    )
  FOR UPDATE
)
INSERT INTO public.audit_logs (
  entity_type, entity_id, action, actor_id, previous_status, new_status,
  before_json, after_json
)
SELECT
  'order', id, 'LIFECYCLE_REPAIR', auth.uid(), current_operational_state,
  current_operational_state,
  jsonb_build_object(
    'salesperson_action_required', salesperson_action_required,
    'salesperson_action_type', salesperson_action_type,
    'salesperson_action_due_date', salesperson_action_due_date
  ),
  jsonb_build_object(
    'salesperson_action_required', false,
    'salesperson_action_type', NULL,
    'salesperson_action_due_date', NULL,
    'repair', 'clear final-state action marker'
  )
FROM stale_final_actions;

UPDATE public.orders
SET salesperson_action_required = false,
    salesperson_action_type = NULL,
    salesperson_action_due_date = NULL
WHERE current_operational_state IN ('DELIVERED', 'CANCELLED')
  AND (
    salesperson_action_required IS TRUE
    OR salesperson_action_type IS NOT NULL
    OR salesperson_action_due_date IS NOT NULL
  );

-- All tab-changing writes may use this guarded service. Specialized delivery,
-- stock, and finance RPCs remain responsible for their own domain fields.
CREATE OR REPLACE FUNCTION public.transition_order_lifecycle(
  p_order_id uuid,
  p_to_state text,
  p_expected_state text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_next_delivery_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_from_state text;
  v_previous_state text;
  v_to_state text := upper(trim(coalesce(p_to_state, '')));
  v_expected_state text := NULLIF(upper(trim(coalesce(p_expected_state, ''))), '');
  v_role text := public.get_user_role(auth.uid())::text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;

  IF v_to_state NOT IN ('BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Unsupported lifecycle state: %', v_to_state USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id USING ERRCODE = 'P0002';
  END IF;

  IF v_role NOT IN ('admin', 'manager')
    AND v_order.salesperson_id IS DISTINCT FROM auth.uid()
    AND v_order.order_owner_id IS DISTINCT FROM auth.uid()
    AND v_order.runner_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'Not authorized to transition order %', p_order_id USING ERRCODE = '42501';
  END IF;

  v_from_state := v_order.current_operational_state;
  v_previous_state := v_from_state;
  IF v_expected_state IS NOT NULL AND v_from_state IS DISTINCT FROM v_expected_state THEN
    RAISE EXCEPTION 'Stale lifecycle state for order %: expected %, found %',
      p_order_id, v_expected_state, v_from_state USING ERRCODE = '40001';
  END IF;

  IF v_from_state = v_to_state THEN
    RETURN jsonb_build_object(
      'success', true,
      'changed', false,
      'order_id', p_order_id,
      'from_state', v_from_state,
      'to_state', v_to_state,
      'updated_at', v_order.updated_at
    );
  END IF;

  IF v_from_state IN ('DELIVERED', 'CANCELLED')
    AND v_to_state NOT IN ('DELIVERED', 'CANCELLED')
  THEN
    RAISE EXCEPTION 'Final order % must be explicitly reopened before moving to %',
      p_order_id, v_to_state USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = CASE v_to_state
        WHEN 'BOOKING' THEN 'BOOKING'::order_status
        WHEN 'READY' THEN 'READY'::order_status
        WHEN 'CANCELLED' THEN 'CANCELLED'::order_status
        ELSE status
      END,
      operational_status = CASE v_to_state
        WHEN 'BOOKING' THEN CASE WHEN p_next_delivery_date IS NULL THEN 'NEW' ELSE 'RESCHEDULED' END
        WHEN 'READY' THEN 'NEW'
        WHEN 'CANCELLED' THEN 'CANCELLED'
        WHEN 'DELIVERED' THEN 'DELIVERED_FINAL'
        ELSE operational_status
      END,
      salesperson_action_required = CASE WHEN v_to_state = 'ACTION_REQUIRED' THEN true ELSE false END,
      salesperson_action_type = CASE WHEN v_to_state = 'ACTION_REQUIRED' THEN NULLIF(p_reason, '') ELSE NULL END,
      salesperson_action_due_date = CASE WHEN v_to_state = 'ACTION_REQUIRED' THEN p_next_delivery_date ELSE NULL END,
      next_delivery_date = CASE
        WHEN v_to_state = 'BOOKING' THEN p_next_delivery_date
        WHEN v_to_state IN ('READY', 'DELIVERED', 'CANCELLED') THEN NULL
        ELSE next_delivery_date
      END,
      runner_review_status = CASE WHEN v_to_state IN ('BOOKING', 'READY') THEN 'NOT_REVIEWED' ELSE runner_review_status END,
      runner_final_outcome = CASE WHEN v_to_state IN ('BOOKING', 'READY') THEN NULL ELSE runner_final_outcome END,
      updated_at = now()
  WHERE id = p_order_id;

  SELECT current_operational_state, updated_at
  INTO v_from_state, v_order.updated_at
  FROM public.orders
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'order_id', p_order_id,
    'from_state', v_previous_state,
    'to_state', v_from_state,
    'updated_at', v_order.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_order_lifecycle(uuid, text, text, text, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.transition_order_lifecycle(uuid, text, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_order_lifecycle_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  WITH state_counts AS (
    SELECT current_operational_state AS state, count(*)::bigint AS total
    FROM public.orders
    GROUP BY current_operational_state
  ), canonical_memberships AS (
    SELECT id, count(*) FILTER (WHERE current_operational_state IS NOT NULL)::int AS active_state_count
    FROM public.orders
    GROUP BY id
  )
  SELECT jsonb_build_object(
    'multiple_active_lifecycle_orders', count(*) FILTER (WHERE active_state_count > 1),
    'canonical_state_counts', coalesce((SELECT jsonb_object_agg(state, total) FROM state_counts), '{}'::jsonb),
    'checked_at', now()
  )
  FROM canonical_memberships;
$$;

REVOKE ALL ON FUNCTION public.get_order_lifecycle_health() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_order_lifecycle_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_order_lifecycle()
RETURNS TABLE(
  order_id uuid,
  order_code text,
  current_state text,
  legacy_memberships text[],
  recommended_state text,
  confidence text,
  safe_to_repair boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
  WITH memberships AS (
    SELECT o.id, o.order_code, o.current_operational_state,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN o.status::text = 'BOOKING'
          AND o.runner_status::text NOT IN ('DELIVERED', 'FAILED_DELIVERY')
          AND o.salesperson_action_required IS NOT TRUE
          AND o.runner_review_status IS DISTINCT FROM 'ACTION_REQUIRED'
          AND o.runner_final_outcome IS DISTINCT FROM 'NEED_SALESPERSON_FOLLOWUP'
          THEN 'BOOKING' END,
        CASE WHEN o.status::text = 'READY'
          AND o.runner_status::text NOT IN ('DELIVERED', 'FAILED_DELIVERY')
          THEN 'READY' END,
        CASE WHEN o.salesperson_action_required IS TRUE
          OR o.runner_review_status = 'ACTION_REQUIRED'
          OR o.runner_final_outcome = 'NEED_SALESPERSON_FOLLOWUP'
          OR (o.runner_status::text = 'FAILED_DELIVERY' AND o.status::text = 'READY')
          THEN 'ACTION_REQUIRED' END,
        CASE WHEN o.runner_status::text = 'DELIVERED' OR o.operational_status = 'DELIVERED_FINAL' THEN 'DELIVERED' END,
        CASE WHEN o.status::text = 'CANCELLED' OR o.operational_status IN ('CANCELLED', 'RETURNED', 'REFUNDED') THEN 'CANCELLED' END
      ], NULL) AS legacy_memberships
    FROM public.orders o
  )
  SELECT id, order_code, current_operational_state, legacy_memberships,
    current_operational_state, 'HIGH', false
  FROM memberships
  WHERE cardinality(legacy_memberships) > 1
  ORDER BY order_code;
$$;

REVOKE ALL ON FUNCTION public.reconcile_order_lifecycle() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_order_lifecycle() TO authenticated;

-- Delivered reads consume the same canonical state as the Delivered tab.
DROP FUNCTION IF EXISTS public.get_delivered_orders_fast(uuid, uuid, uuid[], integer, integer);
CREATE OR REPLACE FUNCTION public.get_delivered_orders_fast(
  p_runner_id UUID DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,
  p_salesperson_ids UUID[] DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID, order_code TEXT, order_date DATE, customer_name TEXT, phone TEXT,
  area TEXT, address TEXT, total_amount NUMERIC, total_qty INT,
  payment_method TEXT, runner_status TEXT, reconciliation_status TEXT,
  delivered_at TIMESTAMPTZ, salesperson_id UUID, salesperson_name TEXT,
  runner_id UUID, runner_name TEXT, driver_id UUID, driver_name TEXT,
  items_summary TEXT, items_json JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.order_code, o.order_date, o.customer_name, o.phone, o.area,
    o.address, o.total_amount, o.total_qty, o.payment_method::TEXT,
    o.runner_status::TEXT, o.reconciliation_status::TEXT, o.delivered_at,
    o.salesperson_id, sp.display_name, o.runner_id, rn.display_name,
    o.driver_id, dr.display_name,
    COALESCE((SELECT string_agg(COALESCE(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::TEXT, ', ')
      FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id), 'No items'),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', oi.id, 'product_id', oi.product_id,
      'sku_code', p.sku_code, 'sku_name', p.sku_name, 'sku_label', oi.sku_label,
      'qty', oi.qty, 'price', oi.price, 'line_total', oi.line_total))
      FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = o.id), '[]'::jsonb)
  FROM orders o
  LEFT JOIN profiles sp ON sp.id = o.salesperson_id
  LEFT JOIN profiles rn ON rn.id = o.runner_id
  LEFT JOIN profiles dr ON dr.id = o.driver_id
  WHERE o.current_operational_state = 'DELIVERED'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids))
  ORDER BY o.delivered_at DESC NULLS LAST, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_delivered_orders_fast(uuid, uuid, uuid[], integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_delivered_summary(
  p_runner_id UUID DEFAULT NULL,
  p_salesperson_id UUID DEFAULT NULL,
  p_salesperson_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(total_delivered BIGINT, pending_claim BIGINT, total_amount NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT count(*)::bigint,
    count(*) FILTER (WHERE o.reconciliation_status = 'NOT_CLAIMED')::bigint,
    coalesce(sum(o.total_amount), 0)::numeric
  FROM orders o
  WHERE o.current_operational_state = 'DELIVERED'
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_salesperson_id IS NULL OR o.salesperson_id = p_salesperson_id)
    AND (p_salesperson_ids IS NULL OR o.salesperson_id = ANY(p_salesperson_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_delivered_summary(uuid, uuid, uuid[]) TO authenticated;

-- Global Search returns the same canonical state used by every operational tab.
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
  current_operational_state text,
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
          'cash_settlement', 'driver_operations', 'stock_audit',
          'inbound_stock', 'driver_workload', 'driver_inbox',
          'driver_stock', 'deliver', 'confirm_receipt'
        ]::text[]
      ) AS assistant_runner_ids
  ),
  driver_visible AS (
    SELECT DISTINCT source.order_id
    FROM params
    CROSS JOIN LATERAL public.get_driver_assignment_source(
      NULL, params.user_id, NULL, NULL, false, false
    ) AS source
    WHERE params.role = 'driver'
  )
  SELECT
    o.id, o.order_code, o.customer_name, o.phone, o.runner_id,
    coalesce(runner_profile.display_name, runner_profile.email, 'Unknown Runner')::text,
    o.status::text, o.operational_status, o.current_operational_state,
    o.runner_status::text, o.runner_review_status, o.runner_final_outcome,
    o.runner_comment, o.runner_failed_reason_id, o.salesperson_action_required,
    o.salesperson_action_type, o.next_delivery_date, o.driver_next_delivery_date,
    o.driver_failed_reason, o.delivered_at, o.cancelled_at, o.created_at, o.updated_at
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

-- Admin dashboard counters are mutually exclusive canonical-state counts.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats_admin()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  order_stats json;
  products_count bigint;
  claims_count bigint;
  inbound_count bigint;
  users_count bigint;
BEGIN
  SELECT json_build_object(
    'bookingOrders', count(*) FILTER (WHERE current_operational_state = 'BOOKING'),
    'readyOrders', count(*) FILTER (WHERE current_operational_state = 'READY'),
    'cancelledOrders', count(*) FILTER (WHERE current_operational_state = 'CANCELLED'),
    'pendingDelivery', count(*) FILTER (
      WHERE current_operational_state = 'READY'
        AND runner_status IN ('ASSIGNED', 'TAKEN', 'OUT_FOR_DELIVERY')
    ),
    'deliveredOrders', count(*) FILTER (WHERE current_operational_state = 'DELIVERED'),
    'actionRequired', count(*) FILTER (WHERE current_operational_state = 'ACTION_REQUIRED'),
    'pendingClaimBatches', (SELECT count(*) FROM claim_batches WHERE status = 'ADMIN_ACK_PENDING')
  ) INTO order_stats
  FROM orders;

  SELECT count(*) INTO products_count FROM products;
  SELECT count(*) INTO claims_count FROM claims;
  SELECT count(*) INTO inbound_count FROM inbound_shipments;
  SELECT count(*) INTO users_count FROM profiles WHERE is_active = true;

  RETURN json_build_object(
    'bookingOrders', (order_stats->>'bookingOrders')::int,
    'readyOrders', (order_stats->>'readyOrders')::int,
    'cancelledOrders', (order_stats->>'cancelledOrders')::int,
    'pendingDelivery', (order_stats->>'pendingDelivery')::int,
    'deliveredOrders', (order_stats->>'deliveredOrders')::int,
    'actionRequired', (order_stats->>'actionRequired')::int,
    'pendingClaimBatches', (order_stats->>'pendingClaimBatches')::int,
    'productsCount', products_count,
    'totalClaims', claims_count,
    'totalInbounds', inbound_count,
    'totalUsers', users_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats_admin() TO authenticated;
