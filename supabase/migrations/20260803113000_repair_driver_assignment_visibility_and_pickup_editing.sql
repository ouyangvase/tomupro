-- Repair the existing Driver assignment lifecycle without changing inventory,
-- finance, sales, or delivery-area business rules.

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
  SELECT
    o.id,
    o.order_code,
    o.runner_id,
    o.driver_id,
    COALESCE(driver_profile.display_name, driver_profile.email, 'Unknown Driver')::text,
    public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date),
    CASE
      WHEN o.runner_status::text = 'DELIVERED' THEN 'DELIVERED'
      WHEN o.runner_status::text = 'FAILED_DELIVERY' THEN 'FAILED'
      WHEN public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND NOT (
          o.runner_review_status::text = 'REVIEWED'
          AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
        ) THEN 'ACTIVE'
      WHEN o.driver_status::text IN ('DRIVER_DELIVERED', 'DRIVER_FAILED')
        AND COALESCE(o.runner_accept_status::text, 'PENDING') <> 'ACCEPTED'
        AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
        AND COALESCE(o.runner_status::text, '') NOT IN (
          'DELIVERED', 'FAILED_DELIVERY', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        THEN 'PENDING_ACCEPTANCE'
      ELSE 'INACTIVE'
    END,
    public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
      AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
      AND COALESCE(o.operational_status::text, '') NOT IN (
        'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
      )
      AND NOT (
        o.runner_review_status::text = 'REVIEWED'
        AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
      ),
    public.order_collection_amount(o.payment_method::text, o.total_amount),
    to_jsonb(o)
      || jsonb_build_object(
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
            WHERE oi.order_id = o.id
          ), '[]'::jsonb)
          ELSE '[]'::jsonb
        END
      )
  FROM public.orders o
  LEFT JOIN public.profiles driver_profile ON driver_profile.id = o.driver_id
  WHERE o.driver_id IS NOT NULL
    AND COALESCE(o.status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND COALESCE(o.runner_status::text, '') NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
    AND (p_runner_id IS NULL OR o.runner_id = p_runner_id)
    AND (p_driver_id IS NULL OR o.driver_id = p_driver_id)
    AND (
      p_date_from IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) <= p_date_to
    )
    AND (
      p_active_only IS NOT TRUE
      OR (
        public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
        AND o.driver_status::text IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
        AND COALESCE(o.operational_status::text, '') NOT IN (
          'DELIVERED_FINAL', 'CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED'
        )
        AND NOT (
          o.runner_review_status::text = 'REVIEWED'
          AND o.runner_final_outcome::text = 'NEED_SALESPERSON_FOLLOWUP'
        )
      )
    )
    AND (
      public.get_user_role(auth.uid())::text = 'admin'
      OR (
        public.get_user_role(auth.uid())::text = 'runner'
        AND o.runner_id = auth.uid()
      )
      OR (
        public.get_user_role(auth.uid())::text = 'driver'
        AND o.driver_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.runner_assistants ra
        WHERE ra.assistant_id = auth.uid()
          AND ra.runner_id = o.runner_id
          AND ra.is_active = true
          AND (
            ra.can_manage_driver_inbox = true
            OR ra.can_manage_driver_stock = true
            OR ra.can_view_driver_workload = true
          )
      )
    )
  ORDER BY public.order_operational_date(o.next_delivery_date, o.expected_pickup_date, o.order_date) DESC,
    o.created_at DESC,
    o.id;
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
  v_previous_driver_ids uuid[];
  v_previous_assignments jsonb;
  v_previous_driver_notification_count integer := 0;
  v_notification_id uuid;
  v_action text := upper(COALESCE(p_action, 'ASSIGN'));
  v_batch_date date := COALESCE(p_operational_date, current_date);
  v_scope_label text := CASE
    WHEN p_operational_date IS NULL THEN 'Active dispatch queue'
    ELSE to_char(p_operational_date, 'DD Mon YYYY')
  END;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication is required';
  END IF;

  IF v_role NOT IN ('runner', 'admin') AND NOT EXISTS (
    SELECT 1
    FROM public.runner_assistants ra
    WHERE ra.assistant_id = v_user
      AND ra.is_active = true
      AND ra.can_manage_driver_inbox = true
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign driver orders';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No orders selected';
  END IF;

  IF (
    SELECT COUNT(DISTINCT selected_id)
    FROM unnest(p_order_ids) selected_id
  ) <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Duplicate order IDs are not allowed';
  END IF;

  IF v_action NOT IN ('ASSIGN', 'REASSIGN') THEN
    RAISE EXCEPTION 'Unsupported assignment action %', p_action;
  END IF;

  SELECT display_name
  INTO v_driver_name
  FROM public.profiles
  WHERE id = p_driver_id
    AND role::text = 'driver'
    AND is_active = true;

  IF v_driver_name IS NULL THEN
    RAISE EXCEPTION 'Selected driver is invalid or inactive';
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
          OR (
            p_operational_date IS NOT NULL
            AND public.order_operational_date(next_delivery_date, expected_pickup_date, order_date) <> p_operational_date
          )
        )
        OR status::text IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
        OR COALESCE(
          delivery_area_code,
          public.classify_delivery_area(address, status::text)->>'delivery_area'
        ) IN ('SELF_PICKUP', 'CANCELLED')
        OR (
          p_operational_date IS NOT NULL
          AND COALESCE(
            delivery_area_code,
            public.classify_delivery_area(address, status::text)->>'delivery_area'
          ) = 'NEEDS_REVIEW'
        )
        OR NOT (
          v_role = 'admin'
          OR runner_id = v_user
          OR EXISTS (
            SELECT 1
            FROM public.runner_assistants ra
            WHERE ra.assistant_id = v_user
              AND ra.runner_id = selected.runner_id
              AND ra.is_active = true
              AND ra.can_manage_driver_inbox = true
          )
        )
        OR NOT EXISTS (
          SELECT 1
          FROM public.runner_drivers rd
          WHERE rd.runner_id = selected.runner_id
            AND rd.driver_id = p_driver_id
            AND rd.is_active = true
        )
    )::integer,
    COUNT(*) FILTER (
      WHERE v_action = 'ASSIGN'
        AND driver_id IS NOT NULL
        AND COALESCE(driver_status::text, 'UNASSIGNED') <> 'UNASSIGNED'
    )::integer,
    COALESCE(SUM(public.order_collection_amount(payment_method::text, total_amount)), 0)::numeric
  INTO v_order_count, v_invalid_count, v_conflict_count, v_collect_amount
  FROM selected;

  IF v_order_count <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Some selected orders were not found';
  END IF;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION '% selected orders are outside your Runner scope, not assignable, or the Driver is not linked to the order Runner', v_invalid_count;
  END IF;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION '% selected orders already have a Driver. Use Reassign.', v_conflict_count;
  END IF;

  SELECT
    COALESCE(
      array_remove(array_agg(DISTINCT COALESCE(delivery_area_name, delivery_area_code, area)), NULL),
      ARRAY[]::text[]
    ),
    COALESCE(
      array_agg(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL AND driver_id <> p_driver_id),
      ARRAY[]::uuid[]
    ),
    COALESCE(
      jsonb_object_agg(id::text, driver_id::text) FILTER (WHERE driver_id IS NOT NULL),
      '{}'::jsonb
    )
  INTO v_area_names, v_previous_driver_ids, v_previous_assignments
  FROM public.orders
  WHERE id = ANY(p_order_ids);

  INSERT INTO public.driver_assignment_batches (
    operational_date,
    action,
    selected_order_count,
    selected_collect_amount,
    old_driver_id,
    new_driver_id,
    created_by,
    result_summary
  )
  VALUES (
    v_batch_date,
    v_action,
    v_order_count,
    v_collect_amount,
    CASE
      WHEN cardinality(v_previous_driver_ids) = 1 THEN v_previous_driver_ids[1]
      ELSE NULL
    END,
    p_driver_id,
    v_user,
    jsonb_build_object(
      'areas', v_area_names,
      'driver_name', v_driver_name,
      'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END,
      'previous_driver_ids', v_previous_driver_ids,
      'previous_assignments', v_previous_assignments
    )
  )
  RETURNING id INTO v_batch_id;

  IF v_action = 'REASSIGN' THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      priority,
      reference_type,
      reference_id,
      entity_type,
      recipient_role
    )
    SELECT
      o.driver_id,
      'Delivery Orders Reassigned',
      COUNT(*)::text || ' delivery order(s) were reassigned from you.' ||
        E'\nDate: ' || v_scope_label ||
        E'\nNew Driver: ' || v_driver_name ||
        E'\nOrder(s): ' || string_agg(COALESCE(o.order_code, o.id::text), ', ' ORDER BY o.order_code),
      'DRIVER_BULK_REASSIGNMENT_REMOVED',
      'HIGH',
      'driver_assignment_batch',
      v_batch_id,
      'DRIVER_ASSIGNMENT',
      'driver'
    FROM public.orders o
    WHERE o.id = ANY(p_order_ids)
      AND o.driver_id IS NOT NULL
      AND o.driver_id <> p_driver_id
    GROUP BY o.driver_id;

    GET DIAGNOSTICS v_previous_driver_notification_count = ROW_COUNT;
  END IF;

  UPDATE public.orders
  SET driver_id = p_driver_id,
      driver_status = 'ASSIGNED',
      driver_assignment_batch_id = v_batch_id,
      driver_assigned_at = now(),
      driver_assigned_by = v_user,
      operational_status = 'NEW',
      driver_delivered_at = NULL,
      driver_failed_at = NULL,
      driver_failed_reason = NULL,
      driver_failed_remark = NULL,
      driver_next_delivery_date = NULL,
      driver_payment_method = NULL,
      driver_cash_amount = NULL,
      driver_transfer_amount = NULL,
      runner_accept_status = NULL,
      runner_review_status = 'NOT_REVIEWED',
      runner_final_outcome = NULL,
      runner_comment = NULL,
      runner_failed_reason_id = NULL,
      runner_reviewed_at = NULL,
      runner_reviewed_by = NULL,
      updated_at = now()
  WHERE id = ANY(p_order_ids);

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    priority,
    reference_type,
    reference_id,
    entity_type,
    recipient_role
  )
  VALUES (
    p_driver_id,
    CASE
      WHEN v_action = 'REASSIGN' THEN 'Delivery Orders Reassigned'
      ELSE 'New Delivery Orders Assigned'
    END,
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
      result_summary = result_summary || jsonb_build_object(
        'notification_id', v_notification_id,
        'previous_driver_notification_count', v_previous_driver_notification_count,
        'status', 'applied'
      )
  WHERE id = v_batch_id;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  VALUES (
    'driver_assignment_batch',
    v_batch_id,
    'BULK_DRIVER_' || v_action,
    v_user,
    jsonb_build_object('assignments', v_previous_assignments),
    jsonb_build_object(
      'order_ids', p_order_ids,
      'driver_id', p_driver_id,
      'driver_name', v_driver_name,
      'operational_date', p_operational_date,
      'scope', CASE WHEN p_operational_date IS NULL THEN 'active_queue' ELSE 'date' END,
      'order_count', v_order_count,
      'collect_amount', v_collect_amount,
      'areas', v_area_names,
      'previous_driver_ids', v_previous_driver_ids,
      'previous_driver_notification_count', v_previous_driver_notification_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'assigned_count', v_order_count,
    'collect_amount', v_collect_amount,
    'driver_id', p_driver_id,
    'driver_name', v_driver_name,
    'notification_id', v_notification_id,
    'notified_previous_driver_count', v_previous_driver_notification_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_driver_pickup_task(
  p_pickup_id uuid,
  p_pickup_date date,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pickup public.driver_pickups%ROWTYPE;
  v_need record;
  v_item jsonb;
  v_product_id uuid;
  v_buffer integer;
  v_business_date date := (now() AT TIME ZONE 'Asia/Brunei')::date;
  v_source_order_ids uuid[];
  v_source_order_codes text[];
BEGIN
  SELECT * INTO v_pickup
  FROM public.driver_pickups
  WHERE id = p_pickup_id
  FOR UPDATE;

  IF v_pickup.id IS NULL OR NOT public.can_manage_driver_pickup_scope(v_pickup.runner_id) THEN
    RAISE EXCEPTION 'Pickup not found or not authorized';
  END IF;

  IF v_pickup.pickup_date <> v_business_date OR p_pickup_date <> v_business_date THEN
    RAISE EXCEPTION 'Expired pickups cannot be edited; create a new pickup for today';
  END IF;

  IF v_pickup.status <> 'PENDING_DRIVER_ACK' THEN
    RAISE EXCEPTION 'Only pickups waiting for driver acknowledgement can be edited';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Pickup items must be an array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) item
    GROUP BY item->>'product_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate pickup products are not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_runner_driver_pickup_shortages(v_pickup.runner_id, v_pickup.driver_id)
  ) THEN
    UPDATE public.driver_pickups
    SET status = 'CANCELLED',
        notes = NULLIF(BTRIM(p_notes), ''),
        cancelled_at = now(),
        updated_at = now()
    WHERE id = p_pickup_id;

    RETURN p_pickup_id;
  END IF;

  SELECT
    COALESCE(array_agg(source.order_id ORDER BY source.order_id), ARRAY[]::uuid[]),
    COALESCE(array_agg(source.order_code ORDER BY source.order_id), ARRAY[]::text[])
  INTO v_source_order_ids, v_source_order_codes
  FROM public.get_driver_assignment_source(
    v_pickup.runner_id,
    v_pickup.driver_id,
    NULL,
    NULL,
    true,
    false
  ) source;

  UPDATE public.driver_pickups
  SET notes = NULLIF(BTRIM(p_notes), ''),
      source_order_ids = v_source_order_ids,
      source_order_codes = v_source_order_codes,
      updated_at = now()
  WHERE id = p_pickup_id;

  DELETE FROM public.driver_pickup_items WHERE pickup_id = p_pickup_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    BEGIN
      v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Pickup item has an invalid product ID';
    END;

    SELECT *
    INTO v_need
    FROM public.get_runner_driver_pickup_shortages(v_pickup.runner_id, v_pickup.driver_id)
    WHERE product_id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % is no longer required for this pickup', v_product_id;
    END IF;

    v_buffer := GREATEST(COALESCE(NULLIF(v_item->>'buffer_qty', '')::integer, 0), 0);

    INSERT INTO public.driver_pickup_items (
      pickup_id,
      product_id,
      qty,
      required_qty,
      buffer_qty
    )
    VALUES (
      p_pickup_id,
      v_need.product_id,
      v_need.required_qty + v_buffer,
      v_need.required_qty,
      v_buffer
    );
  END LOOP;

  RETURN p_pickup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.get_driver_assignment_source(uuid, uuid, date, date, boolean, boolean) IS
  'Canonical Driver assignment source. Current assignment status overrides stale Driver attempt flags until the Runner records a final outcome.';
COMMENT ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text) IS
  'Assigns or reassigns orders inside the source Runner scope, requires an active Runner-Driver binding, and clears stale Driver attempt state.';
COMMENT ON FUNCTION public.update_driver_pickup_task(uuid, date, text, jsonb) IS
  'Updates a pending Driver pickup from submitted rows only, allowing storekeepers to remove individual pending pickup items without inventory movements.';

NOTIFY pgrst, 'reload schema';
