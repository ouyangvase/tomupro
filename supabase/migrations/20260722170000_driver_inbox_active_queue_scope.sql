-- Driver Inbox active queue scope.
-- A NULL p_operational_date means "same active order pool as Runner Inbox":
-- READY orders where runner_status is ASSIGNED or TAKEN.

CREATE OR REPLACE FUNCTION public.is_runner_dispatch_active_order(
  p_status text,
  p_runner_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(COALESCE(p_status, '')) = 'READY'
    AND upper(COALESCE(p_runner_status, '')) IN ('ASSIGNED', 'TAKEN')
$$;

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_area_summary(p_operational_date date)
RETURNS TABLE (
  area_code text,
  area_name text,
  district text,
  is_special boolean,
  total_orders integer,
  assigned_orders integer,
  unassigned_orders integer,
  assignment_percentage numeric,
  total_collect_amount numeric,
  assigned_collect_amount numeric,
  unassigned_collect_amount numeric,
  needs_review_orders integer,
  active_driver_count integer,
  driver_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.*,
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
  ),
  area_rows AS (
    SELECT
      da.code,
      da.name,
      da.district,
      da.is_special,
      da.display_order,
      s.id,
      s.driver_id,
      s.driver_status,
      s.collect_amount,
      p.display_name AS driver_name
    FROM public.delivery_areas da
    LEFT JOIN scoped s ON s.resolved_area_code = da.code
    LEFT JOIN public.profiles p ON p.id = s.driver_id
    WHERE da.active = true
  )
  SELECT
    code AS area_code,
    name AS area_name,
    district,
    is_special,
    COUNT(id)::integer AS total_orders,
    CASE WHEN is_special THEN 0 ELSE COUNT(id) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED')::integer END AS assigned_orders,
    CASE WHEN is_special THEN 0 ELSE COUNT(id) FILTER (WHERE driver_id IS NULL OR COALESCE(driver_status, 'UNASSIGNED') = 'UNASSIGNED')::integer END AS unassigned_orders,
    CASE
      WHEN is_special OR COUNT(id) = 0 THEN 0
      ELSE ROUND((COUNT(id) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED')::numeric / COUNT(id)::numeric) * 100, 1)
    END AS assignment_percentage,
    COALESCE(SUM(collect_amount), 0)::numeric AS total_collect_amount,
    CASE WHEN is_special THEN 0 ELSE COALESCE(SUM(collect_amount) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED'), 0)::numeric END AS assigned_collect_amount,
    CASE WHEN is_special THEN 0 ELSE COALESCE(SUM(collect_amount) FILTER (WHERE driver_id IS NULL OR COALESCE(driver_status, 'UNASSIGNED') = 'UNASSIGNED'), 0)::numeric END AS unassigned_collect_amount,
    COUNT(id) FILTER (WHERE code = 'NEEDS_REVIEW')::integer AS needs_review_orders,
    COUNT(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED')::integer AS active_driver_count,
    COALESCE(array_remove(array_agg(DISTINCT driver_name), NULL), ARRAY[]::text[]) AS driver_names
  FROM area_rows
  GROUP BY code, name, district, is_special, display_order
  ORDER BY display_order, code;
$$;

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_locality_summary(
  p_operational_date date,
  p_delivery_area_code text DEFAULT NULL
)
RETURNS TABLE (
  delivery_area_code text,
  delivery_area_name text,
  locality text,
  total_orders integer,
  assigned_orders integer,
  unassigned_orders integer,
  total_collect_amount numeric,
  assigned_collect_amount numeric,
  unassigned_collect_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      o.*,
      COALESCE(o.delivery_area_code, public.classify_delivery_area(o.address, o.status::text)->>'delivery_area') AS resolved_area_code,
      COALESCE(o.normalized_address, public.normalize_brunei_address(o.address)) AS resolved_normalized_address,
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
  ),
  enriched AS (
    SELECT
      s.id,
      da.code,
      da.name,
      s.driver_id,
      s.driver_status,
      s.collect_amount,
      COALESCE(NULLIF(s.normalized_locality, ''), lr.normalized_value, da.name, 'Unspecified') AS locality
    FROM scoped s
    JOIN public.delivery_areas da ON da.code = s.resolved_area_code
    LEFT JOIN LATERAL (
      SELECT r.normalized_value
      FROM public.delivery_area_rules r
      WHERE r.active = true
        AND r.delivery_area_code = s.resolved_area_code
        AND r.rule_type IN ('locality', 'kampong', 'mukim', 'landmark', 'postal_code', 'postal_prefix')
        AND s.resolved_normalized_address LIKE ('%' || r.normalized_value || '%')
      ORDER BY r.priority DESC, r.confidence DESC, length(r.normalized_value) DESC
      LIMIT 1
    ) lr ON true
    WHERE da.active = true
      AND (p_delivery_area_code IS NULL OR da.code = p_delivery_area_code)
  )
  SELECT
    code AS delivery_area_code,
    name AS delivery_area_name,
    locality,
    COUNT(id)::integer AS total_orders,
    COUNT(id) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED')::integer AS assigned_orders,
    COUNT(id) FILTER (WHERE driver_id IS NULL OR COALESCE(driver_status, 'UNASSIGNED') = 'UNASSIGNED')::integer AS unassigned_orders,
    COALESCE(SUM(collect_amount), 0)::numeric AS total_collect_amount,
    COALESCE(SUM(collect_amount) FILTER (WHERE driver_id IS NOT NULL AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED'), 0)::numeric AS assigned_collect_amount,
    COALESCE(SUM(collect_amount) FILTER (WHERE driver_id IS NULL OR COALESCE(driver_status, 'UNASSIGNED') = 'UNASSIGNED'), 0)::numeric AS unassigned_collect_amount
  FROM enriched
  GROUP BY code, name, locality
  ORDER BY unassigned_orders DESC, total_orders DESC, locality;
$$;

CREATE OR REPLACE FUNCTION public.get_runner_dispatch_driver_workloads(p_operational_date date)
RETURNS TABLE (
  driver_id uuid,
  driver_name text,
  is_available boolean,
  assigned_order_count integer,
  collect_amount numeric,
  area_codes text[],
  area_names text[],
  capacity integer,
  remaining_capacity integer,
  notification_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH linked_drivers AS (
    SELECT
      rd.driver_id,
      p.display_name AS driver_name,
      COALESCE(p.is_active, true) AND rd.is_active AS is_available,
      MAX(dap.capacity) AS capacity
    FROM public.runner_drivers rd
    JOIN public.profiles p ON p.id = rd.driver_id
    LEFT JOIN public.driver_area_preferences dap
      ON dap.runner_id = rd.runner_id
      AND dap.driver_id = rd.driver_id
      AND dap.active = true
    WHERE rd.is_active = true
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (public.get_user_role(auth.uid())::text = 'runner' AND rd.runner_id = auth.uid())
      )
    GROUP BY rd.driver_id, p.display_name, p.is_active, rd.is_active
  ),
  scoped_orders AS (
    SELECT
      o.driver_id,
      COALESCE(o.delivery_area_code, public.classify_delivery_area(o.address, o.status::text)->>'delivery_area') AS resolved_area_code,
      COALESCE(o.delivery_area_name, da.name, o.delivery_area_code, o.area) AS resolved_area_name,
      public.order_collection_amount(o.payment_method::text, o.total_amount) AS collect_amount
    FROM public.orders o
    LEFT JOIN public.delivery_areas da ON da.code = COALESCE(o.delivery_area_code, public.classify_delivery_area(o.address, o.status::text)->>'delivery_area')
    WHERE (
        (p_operational_date IS NULL AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text))
        OR (p_operational_date IS NOT NULL AND public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) = p_operational_date)
      )
      AND o.driver_id IS NOT NULL
      AND COALESCE(o.driver_status, 'UNASSIGNED') <> 'UNASSIGNED'
      AND (
        public.get_user_role(auth.uid())::text = 'admin'
        OR (public.get_user_role(auth.uid())::text = 'runner' AND o.runner_id = auth.uid())
      )
  )
  SELECT
    ld.driver_id,
    ld.driver_name,
    ld.is_available,
    COUNT(so.driver_id)::integer AS assigned_order_count,
    COALESCE(SUM(so.collect_amount), 0)::numeric AS collect_amount,
    COALESCE(array_remove(array_agg(DISTINCT so.resolved_area_code), NULL), ARRAY[]::text[]) AS area_codes,
    COALESCE(array_remove(array_agg(DISTINCT so.resolved_area_name), NULL), ARRAY[]::text[]) AS area_names,
    ld.capacity,
    CASE WHEN ld.capacity IS NULL THEN NULL ELSE GREATEST(ld.capacity - COUNT(so.driver_id)::integer, 0) END AS remaining_capacity,
    'sent'::text AS notification_status
  FROM linked_drivers ld
  LEFT JOIN scoped_orders so ON so.driver_id = ld.driver_id
  GROUP BY ld.driver_id, ld.driver_name, ld.is_available, ld.capacity
  ORDER BY assigned_order_count DESC, ld.driver_name;
$$;

CREATE OR REPLACE FUNCTION public.apply_driver_assignment_batch(
  p_order_ids uuid[],
  p_driver_id uuid,
  p_operational_date date,
  p_action text DEFAULT 'ASSIGN'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_batch_id uuid;
  v_order_count integer;
  v_conflict_count integer;
  v_invalid_count integer;
  v_collect_amount numeric(12,2);
  v_driver_name text;
  v_area_names text[];
  v_notification_id uuid;
  v_action text := upper(COALESCE(p_action, 'ASSIGN'));
  v_batch_date date := COALESCE(p_operational_date, current_date);
  v_scope_label text := CASE WHEN p_operational_date IS NULL THEN 'Active dispatch queue' ELSE to_char(p_operational_date, 'DD Mon YYYY') END;
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can assign driver orders';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No orders selected';
  END IF;

  IF v_action NOT IN ('ASSIGN', 'REASSIGN') THEN
    RAISE EXCEPTION 'Unsupported assignment action %', p_action;
  END IF;

  IF v_role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.runner_drivers
    WHERE runner_id = v_user AND driver_id = p_driver_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Selected driver is not linked to this runner';
  END IF;

  SELECT display_name INTO v_driver_name FROM public.profiles WHERE id = p_driver_id AND role::text = 'driver';
  IF v_driver_name IS NULL THEN
    RAISE EXCEPTION 'Selected driver is invalid';
  END IF;

  WITH selected AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.id = ANY(p_order_ids)
    FOR UPDATE
  )
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (
      WHERE (
          (p_operational_date IS NULL AND NOT public.is_runner_dispatch_active_order(status::text, runner_status::text))
          OR (p_operational_date IS NOT NULL AND public.order_operational_date(next_delivery_date, expected_pickup_date, order_date) <> p_operational_date)
        )
        OR status = 'CANCELLED'
        OR COALESCE(delivery_area_code, public.classify_delivery_area(address, status::text)->>'delivery_area') IN ('SELF_PICKUP', 'CANCELLED', 'NEEDS_REVIEW')
        OR NOT (runner_id = v_user OR v_role = 'admin')
    )::integer,
    COUNT(*) FILTER (
      WHERE v_action = 'ASSIGN'
        AND driver_id IS NOT NULL
        AND COALESCE(driver_status, 'UNASSIGNED') <> 'UNASSIGNED'
    )::integer,
    COALESCE(SUM(public.order_collection_amount(payment_method::text, total_amount)), 0)::numeric
  INTO v_order_count, v_invalid_count, v_conflict_count, v_collect_amount
  FROM selected;

  IF v_order_count <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Some selected orders were not found';
  END IF;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION '% selected orders are not assignable in this Driver Inbox scope or still need review', v_invalid_count;
  END IF;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION '% selected orders already have a driver. Use Reassign.', v_conflict_count;
  END IF;

  SELECT COALESCE(array_remove(array_agg(DISTINCT COALESCE(delivery_area_name, delivery_area_code, area)), NULL), ARRAY[]::text[])
  INTO v_area_names
  FROM public.orders
  WHERE id = ANY(p_order_ids);

  INSERT INTO public.driver_assignment_batches (
    operational_date,
    action,
    selected_order_count,
    selected_collect_amount,
    new_driver_id,
    created_by,
    result_summary
  ) VALUES (
    v_batch_date,
    v_action,
    v_order_count,
    v_collect_amount,
    p_driver_id,
    v_user,
    jsonb_build_object('areas', v_area_names, 'driver_name', v_driver_name, 'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END)
  )
  RETURNING id INTO v_batch_id;

  UPDATE public.orders
  SET driver_id = p_driver_id,
      driver_status = 'ASSIGNED',
      driver_assignment_batch_id = v_batch_id,
      driver_assigned_at = now(),
      driver_assigned_by = v_user,
      updated_at = now()
  WHERE id = ANY(p_order_ids);

  INSERT INTO public.notifications (
    user_id, title, message, type, priority,
    reference_type, reference_id, entity_type, recipient_role
  )
  VALUES (
    p_driver_id,
    CASE WHEN v_action = 'REASSIGN' THEN 'Delivery Orders Reassigned' ELSE 'New Delivery Orders Assigned' END,
    'You have received ' || v_order_count || ' delivery order(s).' ||
      E'\nDate: ' || v_scope_label ||
      E'\nArea(s): ' || COALESCE(array_to_string(v_area_names, ', '), 'Not specified') ||
      E'\nCollection amount: BND ' || to_char(v_collect_amount, 'FM999999990.00') ||
      E'\nOpen My Deliveries to view the orders.',
    'DRIVER_BULK_ASSIGNMENT',
    'HIGH',
    'driver_assignment_batch',
    v_batch_id,
    'DRIVER_ASSIGNMENT',
    'driver'
  )
  RETURNING id INTO v_notification_id;

  UPDATE public.driver_assignment_batches
  SET notification_id = v_notification_id,
      result_summary = result_summary || jsonb_build_object('notification_id', v_notification_id, 'status', 'applied')
  WHERE id = v_batch_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES (
    'driver_assignment_batch',
    v_batch_id,
    'BULK_DRIVER_' || v_action,
    v_user,
    jsonb_build_object(
      'order_ids', p_order_ids,
      'driver_id', p_driver_id,
      'driver_name', v_driver_name,
      'operational_date', p_operational_date,
      'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END,
      'order_count', v_order_count,
      'collect_amount', v_collect_amount,
      'areas', v_area_names
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'assigned_count', v_order_count,
    'collect_amount', v_collect_amount,
    'driver_id', p_driver_id,
    'driver_name', v_driver_name,
    'notification_id', v_notification_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_driver_assignment_batch(
  p_order_ids uuid[],
  p_operational_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_batch_id uuid;
  v_order_count integer;
  v_collect_amount numeric(12,2);
  v_batch_date date := COALESCE(p_operational_date, current_date);
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can remove driver assignments';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No orders selected';
  END IF;

  WITH selected AS (
    SELECT *
    FROM public.orders
    WHERE id = ANY(p_order_ids)
      AND (
        (p_operational_date IS NULL AND public.is_runner_dispatch_active_order(status::text, runner_status::text))
        OR (p_operational_date IS NOT NULL AND public.order_operational_date(next_delivery_date, expected_pickup_date, order_date) = p_operational_date)
      )
      AND (runner_id = v_user OR v_role = 'admin')
    FOR UPDATE
  )
  SELECT COUNT(*)::integer,
         COALESCE(SUM(public.order_collection_amount(payment_method::text, total_amount)), 0)::numeric
  INTO v_order_count, v_collect_amount
  FROM selected;

  IF v_order_count <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Some selected orders were not found or are not allowed';
  END IF;

  INSERT INTO public.driver_assignment_batches (
    operational_date, action, selected_order_count, selected_collect_amount, created_by, result_summary
  )
  VALUES (v_batch_date, 'UNASSIGN', v_order_count, v_collect_amount, v_user, jsonb_build_object('status', 'applied', 'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END))
  RETURNING id INTO v_batch_id;

  UPDATE public.orders
  SET driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_assignment_batch_id = v_batch_id,
      driver_assigned_at = NULL,
      driver_assigned_by = NULL,
      updated_at = now()
  WHERE id = ANY(p_order_ids);

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES ('driver_assignment_batch', v_batch_id, 'BULK_DRIVER_UNASSIGN', v_user,
          jsonb_build_object('order_ids', p_order_ids, 'operational_date', p_operational_date, 'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END, 'order_count', v_order_count));

  RETURN jsonb_build_object('success', true, 'batch_id', v_batch_id, 'unassigned_count', v_order_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_driver_selected_orders(
  p_order_ids uuid[],
  p_operational_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_batch_id uuid;
  v_order_count integer;
  v_collect_amount numeric(12,2);
  v_notification_count integer := 0;
  v_group record;
  v_batch_date date := COALESCE(p_operational_date, current_date);
  v_scope_label text := CASE WHEN p_operational_date IS NULL THEN 'Active dispatch queue' ELSE to_char(p_operational_date, 'DD Mon YYYY') END;
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can notify drivers';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No orders selected';
  END IF;

  WITH selected AS (
    SELECT *
    FROM public.orders
    WHERE id = ANY(p_order_ids)
      AND (
        (p_operational_date IS NULL AND public.is_runner_dispatch_active_order(status::text, runner_status::text))
        OR (p_operational_date IS NOT NULL AND public.order_operational_date(next_delivery_date, expected_pickup_date, order_date) = p_operational_date)
      )
      AND (runner_id = v_user OR v_role = 'admin')
  )
  SELECT COUNT(*)::integer,
         COALESCE(SUM(public.order_collection_amount(payment_method::text, total_amount)), 0)::numeric
  INTO v_order_count, v_collect_amount
  FROM selected;

  IF v_order_count <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Some selected orders were not found or are not in this Driver Inbox scope';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = ANY(p_order_ids)
      AND (driver_id IS NULL OR COALESCE(driver_status, 'UNASSIGNED') = 'UNASSIGNED')
      AND (runner_id = v_user OR v_role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Only assigned orders can be notified. Assign a driver first.';
  END IF;

  INSERT INTO public.driver_assignment_batches (
    operational_date, action, selected_order_count, selected_collect_amount, created_by, result_summary
  )
  VALUES (
    v_batch_date, 'NOTIFY_DRIVER', v_order_count, v_collect_amount, v_user,
    jsonb_build_object('status', 'queued', 'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END)
  )
  RETURNING id INTO v_batch_id;

  FOR v_group IN
    SELECT
      o.driver_id,
      p.display_name AS driver_name,
      COUNT(*)::integer AS order_count,
      COALESCE(SUM(public.order_collection_amount(o.payment_method::text, o.total_amount)), 0)::numeric AS collect_amount,
      COALESCE(array_remove(array_agg(DISTINCT COALESCE(o.delivery_area_name, o.delivery_area_code, o.area)), NULL), ARRAY[]::text[]) AS areas
    FROM public.orders o
    JOIN public.profiles p ON p.id = o.driver_id
    WHERE o.id = ANY(p_order_ids)
      AND (o.runner_id = v_user OR v_role = 'admin')
    GROUP BY o.driver_id, p.display_name
  LOOP
    INSERT INTO public.notifications (
      user_id, title, message, type, priority,
      reference_type, reference_id, entity_type, recipient_role
    )
    VALUES (
      v_group.driver_id,
      'Delivery Assignment Reminder',
      'You have ' || v_group.order_count || ' assigned delivery order(s).' ||
        E'\nDate: ' || v_scope_label ||
        E'\nArea(s): ' || COALESCE(array_to_string(v_group.areas, ', '), 'Not specified') ||
        E'\nCollection amount: BND ' || to_char(v_group.collect_amount, 'FM999999990.00') ||
        E'\nOpen My Deliveries to view the orders.',
      'DRIVER_ASSIGNMENT_REMINDER',
      'NORMAL',
      'driver_assignment_batch',
      v_batch_id,
      'DRIVER_ASSIGNMENT',
      'driver'
    );
    v_notification_count := v_notification_count + 1;
  END LOOP;

  UPDATE public.driver_assignment_batches
  SET result_summary = jsonb_build_object('status', 'notified', 'notification_count', v_notification_count)
  WHERE id = v_batch_id;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES (
    'driver_assignment_batch',
    v_batch_id,
    'DRIVER_NOTIFICATION_SENT',
    v_user,
    jsonb_build_object(
      'order_ids', p_order_ids,
      'operational_date', p_operational_date,
      'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END,
      'order_count', v_order_count,
      'collect_amount', v_collect_amount,
      'notification_count', v_notification_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'notified_driver_count', v_notification_count,
    'order_count', v_order_count,
    'collect_amount', v_collect_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.send_orders_to_needs_review(
  p_order_ids uuid[],
  p_operational_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_batch_id uuid;
  v_order_count integer;
  v_collect_amount numeric(12,2);
  v_batch_date date := COALESCE(p_operational_date, current_date);
BEGIN
  IF v_role NOT IN ('runner', 'admin') THEN
    RAISE EXCEPTION 'Only runner users can send orders to Needs Review';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No orders selected';
  END IF;

  WITH selected AS (
    SELECT *
    FROM public.orders
    WHERE id = ANY(p_order_ids)
      AND (
        (p_operational_date IS NULL AND public.is_runner_dispatch_active_order(status::text, runner_status::text))
        OR (p_operational_date IS NOT NULL AND public.order_operational_date(next_delivery_date, expected_pickup_date, order_date) = p_operational_date)
      )
      AND (runner_id = v_user OR v_role = 'admin')
    FOR UPDATE
  )
  SELECT COUNT(*)::integer,
         COALESCE(SUM(public.order_collection_amount(payment_method::text, total_amount)), 0)::numeric
  INTO v_order_count, v_collect_amount
  FROM selected;

  IF v_order_count <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Some selected orders were not found or are not in this Driver Inbox scope';
  END IF;

  INSERT INTO public.driver_assignment_batches (
    operational_date, action, selected_order_count, selected_collect_amount, created_by, result_summary
  )
  VALUES (
    v_batch_date, 'SEND_TO_NEEDS_REVIEW', v_order_count, v_collect_amount, v_user,
    jsonb_build_object('status', 'applied', 'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END)
  )
  RETURNING id INTO v_batch_id;

  UPDATE public.orders
  SET delivery_area_code = 'NEEDS_REVIEW',
      delivery_area_name = 'Needs Review',
      area_classification_status = 'NEEDS_REVIEW',
      area_classification_confidence = LEAST(COALESCE(area_classification_confidence, 0), 0.74),
      area_classification_source = 'manual_review_requested',
      area_classification_reason = 'Runner sent this order to Needs Review',
      area_classified_at = now(),
      area_classified_by = v_user,
      area_manual_override = true,
      updated_at = now()
  WHERE id = ANY(p_order_ids)
    AND (runner_id = v_user OR v_role = 'admin');

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, after_json)
  VALUES (
    'driver_assignment_batch',
    v_batch_id,
    'ORDERS_SENT_TO_NEEDS_REVIEW',
    v_user,
    jsonb_build_object(
      'order_ids', p_order_ids,
      'operational_date', p_operational_date,
      'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END,
      'order_count', v_order_count,
      'collect_amount', v_collect_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'order_count', v_order_count,
    'collect_amount', v_collect_amount
  );
END;
$$;
