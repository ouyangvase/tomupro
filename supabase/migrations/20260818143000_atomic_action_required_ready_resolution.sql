-- Resolve Action Required -> Ready as one transaction.
--
-- The previous UI path changed the lifecycle through one RPC and then wrote
-- the review/assignment fields through a second orders.update. That split
-- allowed a concurrent Driver event or legacy writer to reassert an old
-- Action Required marker after the conversion.

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
      p_order_id, upper(trim(p_expected_state)), v_from_state USING ERRCODE = '40001';
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

REVOKE ALL ON FUNCTION public.resolve_action_required_to_ready(uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_action_required_to_ready(uuid, text, text)
  TO authenticated;

-- Defense in depth for legacy clients that still write status directly. Only
-- a real ACTION_REQUIRED -> READY status change may clear stale markers;
-- later runner/driver updates must never silently resolve an action.
CREATE OR REPLACE FUNCTION private.normalize_explicit_ready_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status::text IS DISTINCT FROM 'READY'
      AND NEW.status::text = 'READY'
      AND OLD.current_operational_state = 'ACTION_REQUIRED'
      AND COALESCE(NEW.salesperson_action_required, false) = false
    THEN
      NEW.operational_status := 'NEW';
      NEW.reschedule_flag := false;
      NEW.next_delivery_date := NULL;
      NEW.runner_id := NULL;
      NEW.runner_status := 'UNASSIGNED';
      NEW.runner_accept_status := NULL;
      NEW.runner_review_status := 'NOT_REVIEWED';
      NEW.runner_final_outcome := NULL;
      NEW.runner_failed_reason_id := NULL;
      NEW.runner_comment := NULL;
      NEW.runner_reviewed_at := NULL;
      NEW.runner_reviewed_by := NULL;
      NEW.driver_id := NULL;
      NEW.driver_status := 'UNASSIGNED';
      NEW.driver_assignment_batch_id := NULL;
      NEW.driver_assigned_at := NULL;
      NEW.driver_assigned_by := NULL;
      NEW.driver_started_at := NULL;
      NEW.driver_started_by := NULL;
      NEW.driver_delivered_at := NULL;
      NEW.driver_failed_at := NULL;
      NEW.driver_failed_reason := NULL;
      NEW.driver_failed_remark := NULL;
      NEW.driver_next_delivery_date := NULL;
      NEW.failed_reason := NULL;
      NEW.failed_remark := NULL;
      NEW.failed_next_step := NULL;
      NEW.delivered_at := NULL;
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

DROP TRIGGER IF EXISTS zz_normalize_explicit_ready_conversion ON public.orders;
CREATE TRIGGER zz_normalize_explicit_ready_conversion
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION private.normalize_explicit_ready_conversion();

REVOKE ALL ON FUNCTION private.normalize_explicit_ready_conversion()
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
