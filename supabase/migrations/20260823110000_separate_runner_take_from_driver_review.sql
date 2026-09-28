-- Separate the Runner's assignment/take marker from Driver-result review.
--
-- runner_accept_status is a legacy field used by several Runner assignment
-- flows. It is not safe as the sole review gate: a Driver can submit a result
-- after that field is already ACCEPTED. The review boundary is the explicit
-- runner_review_status plus the immutable delivery_attempts decision.

BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'private.order_lifecycle_state(text,text,text,text,text,text,text,boolean,date,uuid)'::regprocedure;
  v_definition text;
  v_before constant text := E'      AND runner_accept_status <> ''ACCEPTED''\n      AND runner_review_status <> ''REVIEWED''';
  v_after constant text := E'      AND runner_review_status <> ''REVIEWED''';
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, v_before) > 0 THEN
    EXECUTE replace(v_definition, v_before, v_after);
  ELSIF strpos(v_definition, 'runner_review_status <> ''REVIEWED''') = 0 THEN
    RAISE EXCEPTION 'order_lifecycle_state review boundary was not found';
  END IF;
END;
$migration$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_guard_before constant text := E'  IF COALESCE(v_order.runner_accept_status, ''PENDING'') = ''ACCEPTED''\n    OR COALESCE(v_order.runner_review_status, ''NOT_REVIEWED'') = ''REVIEWED''\n  THEN';
  v_guard_after constant text := E'  IF COALESCE(v_order.runner_review_status, ''NOT_REVIEWED'') = ''REVIEWED''\n    OR EXISTS (\n      SELECT 1\n      FROM public.delivery_attempts current_attempt\n      WHERE current_attempt.id = (\n        SELECT latest_attempt.id\n        FROM public.delivery_attempts latest_attempt\n        WHERE latest_attempt.order_id = v_order.id\n          AND latest_attempt.driver_id IS NOT DISTINCT FROM v_order.driver_id\n          AND latest_attempt.active_assignment_id IS NOT DISTINCT FROM v_order.driver_assignment_batch_id\n          AND latest_attempt.superseded_at IS NULL\n        ORDER BY latest_attempt.submitted_at DESC, latest_attempt.created_at DESC, latest_attempt.id DESC\n        LIMIT 1\n      )\n        AND current_attempt.runner_decision IN (''ACCEPTED'', ''REJECTED'')\n    )\n  THEN';
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, v_guard_before) > 0 THEN
    v_rewritten := replace(v_definition, v_guard_before, v_guard_after);
  ELSIF strpos(v_definition, 'current_attempt.runner_decision IN (''ACCEPTED'', ''REJECTED'')') > 0 THEN
    v_rewritten := v_definition;
  ELSE
    RAISE EXCEPTION 'review_driver_delivery review guard was not found';
  END IF;

  -- A normal accepted Driver result is final only after this review RPC.
  -- Record that explicitly so a later queue read cannot confuse the earlier
  -- Runner assignment acceptance with the Driver-result review.
  v_rewritten := replace(
    v_rewritten,
    E'      SET runner_accept_status = ''ACCEPTED'',\n          runner_status = ''FAILED_DELIVERY'',\n          updated_at = now()',
    E'      SET runner_accept_status = ''ACCEPTED'',\n          runner_status = ''FAILED_DELIVERY'',\n          runner_review_status = ''REVIEWED'',\n          runner_reviewed_at = now(),\n          runner_reviewed_by = p_actor_id,\n          updated_at = now()'
  );
  v_rewritten := replace(
    v_rewritten,
    E'      SET runner_accept_status = ''ACCEPTED'',\n          runner_status = ''DELIVERED'',\n          delivered_at = now(),\n          updated_at = now()',
    E'      SET runner_accept_status = ''ACCEPTED'',\n          runner_status = ''DELIVERED'',\n          runner_review_status = ''REVIEWED'',\n          runner_reviewed_at = now(),\n          runner_reviewed_by = p_actor_id,\n          delivered_at = now(),\n          updated_at = now()'
  );

  EXECUTE v_rewritten;
END;
$migration$;

COMMENT ON FUNCTION public.review_driver_delivery(uuid, uuid, boolean, text)
  IS 'Reviews the current Driver attempt. Runner assignment acceptance is not Driver-result review.';

NOTIFY pgrst, 'reload schema';

COMMIT;
