-- Keep an immutable Driver result visible in Dispatch > Drivers even when a
-- previous Runner take released the current order projection.
--
-- The Driver submission is the source of truth for the pending review. Repair
-- the current order projection for existing orphaned submissions, then reject
-- future Runner takes before they can release a pending Driver result.

BEGIN;

-- Record the repair before changing the order projection so the recovery is
-- auditable without modifying the immutable delivery_attempts fact table.
WITH latest_pending_attempt AS (
  SELECT DISTINCT ON (da.order_id)
    da.order_id,
    da.id AS attempt_id,
    da.active_assignment_id,
    da.driver_id,
    da.result_type,
    da.failure_reason,
    da.remark,
    da.reschedule_date,
    da.driver_payment_method,
    da.cash_amount,
    da.transfer_amount,
    da.submitted_at
  FROM public.delivery_attempts AS da
  WHERE da.runner_decision = 'PENDING'
    AND da.superseded_at IS NULL
  ORDER BY da.order_id, da.submitted_at DESC, da.created_at DESC, da.id DESC
)
INSERT INTO public.audit_logs (
  entity_type,
  entity_id,
  action,
  actor_id,
  before_json,
  after_json
)
SELECT
  'order',
  o.id,
  'PENDING_DRIVER_REVIEW_RESTORED',
  NULL,
  jsonb_build_object(
    'driver_id', o.driver_id,
    'driver_status', o.driver_status,
    'driver_assignment_batch_id', o.driver_assignment_batch_id,
    'runner_status', o.runner_status
  ),
  jsonb_build_object(
    'driver_id', attempt.driver_id,
    'driver_status', CASE
      WHEN attempt.result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN 'DRIVER_DELIVERED'
      ELSE 'DRIVER_FAILED'
    END,
    'driver_assignment_batch_id', attempt.active_assignment_id,
    'delivery_attempt_id', attempt.attempt_id,
    'reason', 'Restore pending Driver review after Runner take release'
  )
FROM public.orders AS o
JOIN latest_pending_attempt AS attempt ON attempt.order_id = o.id
WHERE o.driver_id IS NULL
  AND o.current_operational_state = 'READY'
  AND o.runner_status::text IN ('ASSIGNED', 'TAKEN')
  AND o.status::text NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
  AND attempt.driver_id IS NOT NULL;

WITH latest_pending_attempt AS (
  SELECT DISTINCT ON (da.order_id)
    da.order_id,
    da.active_assignment_id,
    da.driver_id,
    da.result_type,
    da.failure_reason,
    da.remark,
    da.reschedule_date,
    da.driver_payment_method,
    da.cash_amount,
    da.transfer_amount,
    da.submitted_at
  FROM public.delivery_attempts AS da
  WHERE da.runner_decision = 'PENDING'
    AND da.superseded_at IS NULL
  ORDER BY da.order_id, da.submitted_at DESC, da.created_at DESC, da.id DESC
)
UPDATE public.orders AS o
SET driver_id = attempt.driver_id,
    driver_status = CASE
      WHEN attempt.result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN 'DRIVER_DELIVERED'
      ELSE 'DRIVER_FAILED'
    END,
    driver_assignment_batch_id = attempt.active_assignment_id,
    driver_assigned_at = COALESCE(
      o.driver_assigned_at,
      (
        SELECT batch.created_at
        FROM public.driver_assignment_batches AS batch
        WHERE batch.id = attempt.active_assignment_id
      )
    ),
    driver_assigned_by = COALESCE(
      o.driver_assigned_by,
      (
        SELECT batch.created_by
        FROM public.driver_assignment_batches AS batch
        WHERE batch.id = attempt.active_assignment_id
      )
    ),
    driver_delivered_at = CASE
      WHEN attempt.result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN attempt.submitted_at
      ELSE NULL
    END,
    driver_failed_at = CASE
      WHEN attempt.result_type <> 'DRIVER_DELIVERED_SUBMITTED' THEN attempt.submitted_at
      ELSE NULL
    END,
    driver_failed_reason = CASE
      WHEN attempt.result_type <> 'DRIVER_DELIVERED_SUBMITTED' THEN attempt.failure_reason
      ELSE NULL
    END,
    driver_failed_remark = CASE
      WHEN attempt.result_type <> 'DRIVER_DELIVERED_SUBMITTED' THEN attempt.remark
      ELSE NULL
    END,
    driver_next_delivery_date = CASE
      WHEN attempt.result_type <> 'DRIVER_DELIVERED_SUBMITTED' THEN attempt.reschedule_date
      ELSE NULL
    END,
    driver_payment_method = attempt.driver_payment_method,
    driver_cash_amount = attempt.cash_amount,
    driver_transfer_amount = attempt.transfer_amount,
    runner_accept_status = 'PENDING',
    runner_review_status = 'NOT_REVIEWED',
    runner_final_outcome = NULL,
    runner_comment = NULL,
    updated_at = now()
FROM latest_pending_attempt AS attempt
WHERE attempt.order_id = o.id
  AND o.driver_id IS NULL
  AND o.current_operational_state = 'READY'
  AND o.runner_status::text IN ('ASSIGNED', 'TAKEN')
  AND o.status::text NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED')
  AND attempt.driver_id IS NOT NULL;

-- Do not allow Runner Inbox to release a Driver assignment after the Driver
-- has submitted a result. That result must be accepted, rejected, or processed
-- from Dispatch > Drivers first.
CREATE OR REPLACE FUNCTION public.runner_take_orders(p_order_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text := public.get_user_role(v_actor_id)::text;
  v_requested_ids uuid[] := COALESCE(p_order_ids, ARRAY[]::uuid[]);
  v_candidate_ids uuid[] := ARRAY[]::uuid[];
  v_released_order_ids uuid[] := ARRAY[]::uuid[];
  v_driver_ids uuid[] := ARRAY[]::uuid[];
  v_before_assignments jsonb := '[]'::jsonb;
  v_batch_id uuid;
  v_candidate_count integer := 0;
  v_released_count integer := 0;
  v_collect_amount numeric(12,2) := 0;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_actor_role NOT IN ('admin', 'runner', 'runner_assistant') THEN
    RAISE EXCEPTION 'Only Runners can take Inbox orders';
  END IF;

  IF cardinality(v_requested_ids) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'requested_count', 0,
      'taken_count', 0,
      'released_driver_count', 0,
      'released_order_ids', ARRAY[]::uuid[]
    );
  END IF;

  SELECT
    COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::uuid[]),
    COALESCE(array_agg(selected.id ORDER BY selected.id)
      FILTER (WHERE selected.driver_id IS NOT NULL), ARRAY[]::uuid[]),
    COALESCE(array_agg(DISTINCT selected.driver_id ORDER BY selected.driver_id)
      FILTER (WHERE selected.driver_id IS NOT NULL), ARRAY[]::uuid[]),
    COALESCE(jsonb_agg(jsonb_build_object(
      'order_id', selected.id,
      'order_code', selected.order_code,
      'runner_id', selected.runner_id,
      'driver_id', selected.driver_id,
      'driver_status', selected.driver_status,
      'driver_assignment_batch_id', selected.driver_assignment_batch_id,
      'driver_assigned_at', selected.driver_assigned_at,
      'driver_assigned_by', selected.driver_assigned_by
    ) ORDER BY selected.order_code, selected.id), '[]'::jsonb),
    COALESCE(SUM(public.order_collection_amount(selected.payment_method::text, selected.total_amount))
      FILTER (WHERE selected.driver_id IS NOT NULL), 0)::numeric
  INTO v_candidate_ids, v_released_order_ids, v_driver_ids, v_before_assignments, v_collect_amount
  FROM (
    SELECT o.*
    FROM public.orders o
    WHERE o.id = ANY(v_requested_ids)
      AND o.current_operational_state = 'READY'
      AND o.runner_status::text IN ('ASSIGNED', 'TAKEN')
      AND public.is_runner_dispatch_active_order(o.status::text, o.runner_status::text)
      AND (
        v_actor_role = 'admin'
        OR (v_actor_role = 'runner' AND o.runner_id = v_actor_id)
        OR (
          v_actor_role = 'runner_assistant'
          AND public.has_runner_assistant_permission(v_actor_id, o.runner_id, 'deliver')
        )
      )
    ORDER BY o.id
    FOR UPDATE
  ) selected;

  v_candidate_count := cardinality(v_candidate_ids);
  IF v_candidate_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'requested_count', cardinality(v_requested_ids),
      'taken_count', 0,
      'released_driver_count', 0,
      'released_order_ids', ARRAY[]::uuid[]
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.delivery_attempts AS attempt
    WHERE attempt.order_id = ANY(v_candidate_ids)
      AND attempt.runner_decision = 'PENDING'
      AND attempt.superseded_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'A Driver result is waiting for Runner review. Review it from Dispatch > Drivers before taking the order';
  END IF;

  IF cardinality(v_released_order_ids) > 0 THEN
    INSERT INTO public.driver_assignment_batches (
      operational_date,
      action,
      selected_order_count,
      selected_collect_amount,
      created_by,
      result_summary
    )
    VALUES (
      (now() AT TIME ZONE 'Asia/Brunei')::date,
      'UNASSIGN',
      cardinality(v_released_order_ids),
      v_collect_amount,
      v_actor_id,
      jsonb_build_object(
        'status', 'applied',
        'source', 'RUNNER_INBOX_TAKE',
        'reason', 'Runner took the order from Inbox',
        'runner_id', v_actor_id,
        'affected_driver_ids', v_driver_ids,
        'affected_order_ids', v_released_order_ids,
        'resulting_runner_status', 'TAKEN'
      )
    )
    RETURNING id INTO v_batch_id;
  END IF;

  INSERT INTO public.audit_logs (
    entity_type,
    entity_id,
    action,
    actor_id,
    before_json,
    after_json
  )
  SELECT
    'order',
    selected.id,
    'RUNNER_TAKE_DRIVER_RELEASED',
    v_actor_id,
    jsonb_build_object(
      'runner_id', selected.runner_id,
      'runner_status', selected.runner_status,
      'driver_id', selected.driver_id,
      'driver_status', selected.driver_status,
      'driver_assignment_batch_id', selected.driver_assignment_batch_id,
      'driver_assigned_at', selected.driver_assigned_at,
      'driver_assigned_by', selected.driver_assigned_by
    ),
    jsonb_build_object(
      'runner_status', 'TAKEN',
      'driver_id', CASE WHEN selected.driver_id IS NOT NULL THEN NULL ELSE selected.driver_id END,
      'driver_status', CASE WHEN selected.driver_id IS NOT NULL THEN 'UNASSIGNED' ELSE selected.driver_status END,
      'driver_assignment_batch_id', v_batch_id,
      'driver_assignment_ended', selected.driver_id IS NOT NULL,
      'reason', 'Runner took the order from Inbox'
    )
  FROM public.orders selected
  WHERE selected.id = ANY(v_candidate_ids);

  UPDATE public.orders
  SET runner_status = 'TAKEN',
      driver_id = CASE WHEN driver_id IS NOT NULL THEN NULL ELSE driver_id END,
      driver_status = CASE WHEN driver_id IS NOT NULL THEN 'UNASSIGNED' ELSE driver_status END,
      driver_assignment_batch_id = CASE WHEN driver_id IS NOT NULL THEN v_batch_id ELSE driver_assignment_batch_id END,
      driver_assigned_at = CASE WHEN driver_id IS NOT NULL THEN NULL ELSE driver_assigned_at END,
      driver_assigned_by = CASE WHEN driver_id IS NOT NULL THEN NULL ELSE driver_assigned_by END,
      updated_at = now()
  WHERE id = ANY(v_candidate_ids);

  v_released_count := cardinality(v_released_order_ids);

  IF v_batch_id IS NOT NULL THEN
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
      'RUNNER_TAKE_RELEASED_DRIVER_ASSIGNMENTS',
      v_actor_id,
      jsonb_build_object('assignments', v_before_assignments),
      jsonb_build_object(
        'runner_id', v_actor_id,
        'order_ids', v_released_order_ids,
        'affected_driver_ids', v_driver_ids,
        'order_count', v_candidate_count,
        'released_driver_count', v_released_count,
        'reason', 'Runner took the order from Inbox',
        'resulting_runner_status', 'TAKEN'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'requested_count', cardinality(v_requested_ids),
    'taken_count', v_candidate_count,
    'released_driver_count', v_released_count,
    'released_order_ids', v_released_order_ids,
    'affected_driver_ids', v_driver_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.runner_take_orders(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.runner_take_orders(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.runner_take_orders(uuid[]) IS
  'Atomically takes authorized Runner Inbox orders, preserving pending Driver review assignments.';

NOTIFY pgrst, 'reload schema';

COMMIT;
