-- Keep an existing Driver assignment when a Runner marks an order as Taken.
-- Runner Take changes the Runner workflow state; it must not silently remove
-- the Driver's delivery job.

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
      'released_order_ids', ARRAY[]::uuid[]
    );
  END IF;

  SELECT
    COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::uuid[]),
    COUNT(*) FILTER (WHERE selected.driver_id IS NOT NULL)::integer
  INTO v_candidate_ids, v_preserved_driver_count
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
      'released_order_ids', ARRAY[]::uuid[]
    );
  END IF;

  -- A Driver result remains attached until it is reviewed from Dispatch >
  -- Drivers. Runner Take must not bypass that review boundary.
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
    'released_order_ids', ARRAY[]::uuid[]
  );
END;
$$;

REVOKE ALL ON FUNCTION public.runner_take_orders(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.runner_take_orders(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.runner_take_orders(uuid[]) IS
  'Atomically takes authorized Runner Inbox orders while preserving any current Driver assignment.';

-- Repair only the recent active orders whose latest Runner Take release is
-- still the last order action. Orders changed or reassigned afterwards are
-- deliberately left alone for the current dispatch workflow to decide.
DO $repair$
DECLARE
  v_runner_id uuid := '4c442dcd-217b-41a1-bd37-17959337257a';
  v_driver record;
  v_order_ids uuid[];
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_runner_id::text, true);

  FOR v_driver IN
    WITH latest_release AS (
      SELECT DISTINCT ON (a.entity_id)
        a.entity_id,
        a.created_at AS release_at,
        a.before_json
      FROM public.audit_logs a
      WHERE a.entity_type = 'order'
        AND a.action = 'RUNNER_TAKE_DRIVER_RELEASED'
        AND (a.before_json->>'driver_id') IS NOT NULL
      ORDER BY a.entity_id, a.created_at DESC, a.id DESC
    ),
    latest_order_audit AS (
      SELECT DISTINCT ON (a.entity_id)
        a.entity_id,
        a.action,
        a.created_at
      FROM public.audit_logs a
      WHERE a.entity_type = 'order'
      ORDER BY a.entity_id, a.created_at DESC, a.id DESC
    )
    SELECT
      (lr.before_json->>'driver_id')::uuid AS driver_id
    FROM latest_release lr
    JOIN public.orders o ON o.id = lr.entity_id
    JOIN latest_order_audit la ON la.entity_id = o.id
    WHERE lr.release_at > now() - interval '24 hours'
      AND la.action = 'RUNNER_TAKE_DRIVER_RELEASED'
      AND lr.before_json->>'driver_status' = 'ASSIGNED'
      AND o.driver_id IS NULL
      AND o.current_operational_state = 'READY'
      AND o.runner_status::text IN ('ASSIGNED', 'TAKEN')
      AND o.runner_id = v_runner_id
    GROUP BY (lr.before_json->>'driver_id')::uuid
  LOOP
    WITH latest_release AS (
      SELECT DISTINCT ON (a.entity_id)
        a.entity_id,
        a.created_at AS release_at,
        a.before_json
      FROM public.audit_logs a
      WHERE a.entity_type = 'order'
        AND a.action = 'RUNNER_TAKE_DRIVER_RELEASED'
        AND (a.before_json->>'driver_id') IS NOT NULL
      ORDER BY a.entity_id, a.created_at DESC, a.id DESC
    ),
    latest_order_audit AS (
      SELECT DISTINCT ON (a.entity_id)
        a.entity_id,
        a.action,
        a.created_at
      FROM public.audit_logs a
      WHERE a.entity_type = 'order'
      ORDER BY a.entity_id, a.created_at DESC, a.id DESC
    )
    SELECT array_agg(o.id ORDER BY o.id)
    INTO v_order_ids
    FROM latest_release lr
    JOIN public.orders o ON o.id = lr.entity_id
    JOIN latest_order_audit la ON la.entity_id = o.id
    WHERE lr.release_at > now() - interval '24 hours'
      AND la.action = 'RUNNER_TAKE_DRIVER_RELEASED'
      AND lr.before_json->>'driver_status' = 'ASSIGNED'
      AND (lr.before_json->>'driver_id')::uuid = v_driver.driver_id
      AND o.driver_id IS NULL
      AND o.current_operational_state = 'READY'
      AND o.runner_status::text IN ('ASSIGNED', 'TAKEN')
      AND o.runner_id = v_runner_id;

    IF cardinality(v_order_ids) > 0 THEN
      PERFORM public.apply_driver_assignment_batch(
        v_order_ids,
        v_driver.driver_id,
        NULL,
        'ASSIGN'
      );
    END IF;
  END LOOP;
END;
$repair$;

NOTIFY pgrst, 'reload schema';

COMMIT;
