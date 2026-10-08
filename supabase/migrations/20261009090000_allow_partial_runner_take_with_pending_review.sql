-- Allow a Runner batch Take to proceed for eligible orders when another
-- selected order is waiting for Driver-result review.
-- Pending Driver results remain blocked and are reported to the caller.

BEGIN;

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
  v_blocked_ids uuid[] := ARRAY[]::uuid[];
  v_blocked_order_codes text[] := ARRAY[]::text[];
  v_preserved_driver_count integer := 0;
  v_candidate_count integer := 0;
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
      'preserved_driver_count', 0,
      'released_driver_count', 0,
      'released_order_ids', ARRAY[]::uuid[],
      'blocked_count', 0,
      'blocked_order_codes', ARRAY[]::text[]
    );
  END IF;

  SELECT
    COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::uuid[])
  INTO v_candidate_ids
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
      'preserved_driver_count', 0,
      'released_driver_count', 0,
      'released_order_ids', ARRAY[]::uuid[],
      'blocked_count', 0,
      'blocked_order_codes', ARRAY[]::text[]
    );
  END IF;

  -- Keep the review boundary per order instead of rejecting the whole batch.
  -- A pending Driver result may not be bypassed, but unrelated orders remain
  -- available for the Runner to take.
  SELECT
    COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::uuid[]),
    COALESCE(array_agg(selected.order_code ORDER BY selected.order_code), ARRAY[]::text[])
  INTO v_blocked_ids, v_blocked_order_codes
  FROM public.orders selected
  WHERE selected.id = ANY(v_candidate_ids)
    AND COALESCE(selected.runner_review_status, 'NOT_REVIEWED') <> 'REVIEWED'
    AND EXISTS (
      SELECT 1
      FROM public.delivery_attempts attempt
      WHERE attempt.order_id = selected.id
        AND attempt.runner_decision = 'PENDING'
        AND attempt.superseded_at IS NULL
    );

  SELECT COALESCE(array_agg(candidate_id ORDER BY candidate_id), ARRAY[]::uuid[])
  INTO v_candidate_ids
  FROM unnest(v_candidate_ids) AS candidate(candidate_id)
  WHERE NOT (candidate_id = ANY(v_blocked_ids));

  v_candidate_count := cardinality(v_candidate_ids);

  SELECT COUNT(*) FILTER (WHERE selected.driver_id IS NOT NULL)::integer
  INTO v_preserved_driver_count
  FROM public.orders selected
  WHERE selected.id = ANY(v_candidate_ids);

  IF v_candidate_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'requested_count', cardinality(v_requested_ids),
      'taken_count', 0,
      'preserved_driver_count', 0,
      'released_driver_count', 0,
      'released_order_ids', ARRAY[]::uuid[],
      'blocked_count', cardinality(v_blocked_ids),
      'blocked_order_codes', to_jsonb(v_blocked_order_codes)
    );
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
    'RUNNER_TAKE_DRIVER_PRESERVED',
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
      'driver_id', selected.driver_id,
      'driver_status', selected.driver_status,
      'driver_assignment_batch_id', selected.driver_assignment_batch_id,
      'driver_assignment_preserved', selected.driver_id IS NOT NULL,
      'reason', 'Runner took the order; Driver assignment preserved'
    )
  FROM public.orders selected
  WHERE selected.id = ANY(v_candidate_ids);

  UPDATE public.orders
  SET runner_status = 'TAKEN',
      updated_at = now()
  WHERE id = ANY(v_candidate_ids);

  RETURN jsonb_build_object(
    'success', true,
    'requested_count', cardinality(v_requested_ids),
    'taken_count', v_candidate_count,
    'preserved_driver_count', v_preserved_driver_count,
    'released_driver_count', 0,
    'released_order_ids', ARRAY[]::uuid[],
    'blocked_count', cardinality(v_blocked_ids),
    'blocked_order_codes', to_jsonb(v_blocked_order_codes)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.runner_take_orders(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.runner_take_orders(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.runner_take_orders(uuid[]) IS
  'Takes eligible authorized Runner Inbox orders, preserves Driver assignments, and reports orders blocked by pending Driver review.';

NOTIFY pgrst, 'reload schema';

COMMIT;
