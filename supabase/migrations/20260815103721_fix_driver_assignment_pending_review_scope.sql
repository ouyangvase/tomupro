-- Keep pending Driver reports visible and classify them explicitly during assignment.
-- A pending Driver result must be reviewed before it can be reassigned; it is not a missing order.
CREATE OR REPLACE FUNCTION public.apply_driver_assignment_batch(p_order_ids uuid[], p_driver_id uuid, p_operational_date date, p_action text DEFAULT 'ASSIGN'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text := public.get_user_role(v_user)::text;
  v_batch_id uuid;
  v_order_count integer;
  v_conflict_count integer;
  v_invalid_count integer;
  v_pending_review_count integer;
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
    COUNT(*) FILTER (
      WHERE private.is_pending_driver_delivery_review(
        driver_status::text,
        runner_accept_status::text,
        runner_review_status::text,
        salesperson_action_required,
        runner_final_outcome::text
      )
    )::integer,
    COALESCE(SUM(public.order_collection_amount(payment_method::text, total_amount)), 0)::numeric
  INTO v_order_count, v_invalid_count, v_conflict_count, v_pending_review_count, v_collect_amount
  FROM selected;

  IF v_order_count <> array_length(p_order_ids, 1) THEN
    RAISE EXCEPTION 'Some selected orders were not found';
  END IF;

  IF v_pending_review_count > 0 THEN
    RAISE EXCEPTION '% selected order(s) have a Driver result waiting for Runner review. Review them from Dispatch > Drivers before reassigning', v_pending_review_count;
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
$function$;


REVOKE ALL ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.apply_driver_assignment_batch(uuid[], uuid, date, text) IS
  'Assigns Driver orders in the Runner scope. Pending Driver results remain immutable until Runner review and return a specific error instead of not found.';
