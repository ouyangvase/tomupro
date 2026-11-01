-- A stale expected lifecycle state is a conflict to show the caller. PostgREST
-- retries SQLSTATE 40001 without limit, so these raises use PT409 (HTTP 409).

CREATE OR REPLACE FUNCTION public.transition_order_lifecycle(
  p_order_id uuid,
  p_to_state text,
  p_expected_state text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_next_delivery_date date DEFAULT NULL,
  p_allow_reopen boolean DEFAULT false
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
  v_is_explicit_cancelled_reopen boolean := false;
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
      p_order_id, v_expected_state, v_from_state USING ERRCODE = 'PT409';
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

  v_is_explicit_cancelled_reopen :=
    p_allow_reopen
    AND v_from_state = 'CANCELLED'
    AND v_to_state IN ('BOOKING', 'READY');

  IF v_from_state IN ('DELIVERED', 'CANCELLED')
    AND v_to_state NOT IN ('DELIVERED', 'CANCELLED')
    AND NOT v_is_explicit_cancelled_reopen
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
      driver_id = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_id
      END,
      driver_status = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN 'UNASSIGNED'
        ELSE driver_status
      END,
      driver_assignment_batch_id = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_assignment_batch_id
      END,
      driver_assigned_at = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_assigned_at
      END,
      driver_assigned_by = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_assigned_by
      END,
      driver_started_at = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_started_at
      END,
      driver_started_by = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_started_by
      END,
      driver_delivered_at = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_delivered_at
      END,
      driver_next_delivery_date = CASE
        WHEN v_to_state IN ('BOOKING', 'READY', 'CANCELLED') THEN NULL
        ELSE driver_next_delivery_date
      END,
      reopened_at = CASE WHEN v_is_explicit_cancelled_reopen THEN now() ELSE reopened_at END,
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

CREATE OR REPLACE FUNCTION public.resolve_action_required_to_ready(
  p_order_id uuid,
  p_expected_state text DEFAULT NULL,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_from_state text;
  v_role text := public.get_user_role(auth.uid())::text;
  v_comment text := COALESCE(NULLIF(trim(p_comment), ''), 'Action Required resolved to Ready');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
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
  THEN
    RAISE EXCEPTION 'Not authorized to resolve order %', p_order_id USING ERRCODE = '42501';
  END IF;

  v_from_state := v_order.current_operational_state;

  IF NULLIF(upper(trim(COALESCE(p_expected_state, ''))), '') IS NOT NULL
    AND v_from_state IS DISTINCT FROM upper(trim(p_expected_state))
  THEN
    RAISE EXCEPTION 'Stale lifecycle state for order %: expected %, found %',
      p_order_id, upper(trim(p_expected_state)), v_from_state USING ERRCODE = 'PT409';
  END IF;

  IF v_from_state IS DISTINCT FROM 'ACTION_REQUIRED' THEN
    RAISE EXCEPTION 'Order % is not currently Action Required (found %)',
      p_order_id, v_from_state USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders
  SET status = 'READY'::order_status,
      operational_status = 'NEW',
      reschedule_flag = false,
      next_delivery_date = NULL,
      salesperson_action_required = false,
      salesperson_action_type = NULL,
      salesperson_action_due_date = NULL,
      runner_id = NULL,
      runner_status = 'UNASSIGNED',
      runner_accept_status = NULL,
      runner_review_status = 'NOT_REVIEWED',
      runner_final_outcome = NULL,
      runner_failed_reason_id = NULL,
      runner_comment = NULL,
      runner_reviewed_at = NULL,
      runner_reviewed_by = NULL,
      driver_id = NULL,
      driver_status = 'UNASSIGNED',
      driver_assignment_batch_id = NULL,
      driver_assigned_at = NULL,
      driver_assigned_by = NULL,
      driver_started_at = NULL,
      driver_started_by = NULL,
      driver_delivered_at = NULL,
      driver_failed_at = NULL,
      driver_failed_reason = NULL,
      driver_failed_remark = NULL,
      driver_next_delivery_date = NULL,
      failed_reason = NULL,
      failed_remark = NULL,
      failed_next_step = NULL,
      delivered_at = NULL,
      last_status_note = v_comment,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.reschedule_history (
    order_id,
    cycle_no,
    from_status,
    to_status,
    next_delivery_date,
    comment,
    rescheduled_by
  ) VALUES (
    p_order_id,
    COALESCE(v_order.reschedule_cycle_no, 0) + 1,
    COALESCE(v_order.operational_status, v_order.status::text),
    'READY',
    NULL,
    v_comment,
    auth.uid()
  );

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  ) VALUES (
    'order',
    p_order_id,
    'ACTION_REQUIRED_RESOLVED_TO_READY',
    auth.uid(),
    jsonb_build_object(
      'order_code', v_order.order_code,
      'status', v_order.status,
      'operational_status', v_order.operational_status,
      'current_operational_state', v_from_state,
      'runner_id', v_order.runner_id,
      'runner_status', v_order.runner_status,
      'runner_review_status', v_order.runner_review_status,
      'runner_final_outcome', v_order.runner_final_outcome,
      'salesperson_action_required', v_order.salesperson_action_required
    ),
    jsonb_build_object(
      'order_code', v_order.order_code,
      'status', 'READY',
      'operational_status', 'NEW',
      'current_operational_state', 'READY',
      'runner_id', NULL,
      'runner_status', 'UNASSIGNED',
      'runner_review_status', 'NOT_REVIEWED',
      'runner_final_outcome', NULL,
      'salesperson_action_required', false,
      'comment', v_comment
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'changed', true,
    'order_id', p_order_id,
    'from_state', v_from_state,
    'to_state', 'READY'
  );
END;
$$;
