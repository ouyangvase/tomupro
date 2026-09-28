-- Keep the immutable Driver submission fact in sync with the Runner review.
--
-- review_driver_delivery historically updated only public.orders. That left
-- delivery_attempts.runner_decision = 'PENDING' forever, so a later Runner
-- take or queue-repair could resurrect an already reviewed Driver result and
-- move the order back to Action Required.

BEGIN;

DO $$
DECLARE
  v_signature regprocedure := 'public.review_driver_delivery(uuid,uuid,boolean,text)'::regprocedure;
  v_definition text;
  v_rewritten text;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  v_rewritten := replace(
    v_definition,
    E'  INSERT INTO public.audit_logs (\n    entity_type,\n',
    E'  IF v_has_attempt THEN\n'
      || E'    UPDATE public.delivery_attempts\n'
      || E'    SET runner_decision = CASE WHEN p_accept THEN ''ACCEPTED'' ELSE ''REJECTED'' END,\n'
      || E'        runner_decision_at = now()\n'
      || E'    WHERE id = v_attempt.id\n'
      || E'      AND runner_decision = ''PENDING''\n'
      || E'      AND superseded_at IS NULL;\n'
      || E'  END IF;\n\n'
      || E'  INSERT INTO public.audit_logs (\n    entity_type,\n'
  );

  IF v_rewritten = v_definition THEN
    IF strpos(v_definition, 'runner_decision_at = now()') = 0 THEN
      RAISE EXCEPTION 'review_driver_delivery audit boundary was not found';
    END IF;
  ELSE
    EXECUTE v_rewritten;
  END IF;
END;
$$;

-- Repair historical attempts only when the order audit trail contains a
-- definitive Runner decision in the time window belonging to that attempt.
WITH decided_attempts AS (
  SELECT
    da.id AS attempt_id,
    CASE
      WHEN decision.action IN ('DRIVER_DELIVERY_ACCEPTED', 'DRIVER_FAILURE_ACCEPTED',
                               'DRIVER_DELIVERY_DEFERRED', 'DRIVER_RESCHEDULE_ACCEPTED')
        THEN 'ACCEPTED'
      WHEN decision.action = 'DRIVER_REPORT_REJECTED' THEN 'REJECTED'
    END AS decision,
    decision.created_at AS decision_at
  FROM public.delivery_attempts da
  JOIN LATERAL (
    SELECT a.action, a.created_at
    FROM public.audit_logs a
    WHERE a.entity_id = da.order_id
      AND a.created_at >= da.submitted_at
      AND a.created_at < COALESCE(
        (
          SELECT next_attempt.submitted_at
          FROM public.delivery_attempts next_attempt
          WHERE next_attempt.order_id = da.order_id
            AND next_attempt.submitted_at > da.submitted_at
          ORDER BY next_attempt.submitted_at, next_attempt.created_at, next_attempt.id
          LIMIT 1
        ),
        'infinity'::timestamptz
      )
      AND a.action IN (
        'DRIVER_DELIVERY_ACCEPTED',
        'DRIVER_FAILURE_ACCEPTED',
        'DRIVER_DELIVERY_DEFERRED',
        'DRIVER_RESCHEDULE_ACCEPTED',
        'DRIVER_REPORT_REJECTED'
      )
      AND (
        a.before_json ->> 'driver_id' = da.driver_id::text
        OR a.after_json ->> 'driver_id' = da.driver_id::text
        OR a.after_json ->> 'previous_driver_id' = da.driver_id::text
      )
    ORDER BY a.created_at, a.id
    LIMIT 1
  ) decision ON true
  WHERE da.runner_decision = 'PENDING'
    AND da.superseded_at IS NULL
)
UPDATE public.delivery_attempts da
SET runner_decision = decided.decision,
    runner_decision_at = decided.decision_at
FROM decided_attempts decided
WHERE da.id = decided.attempt_id;

-- Any older pending attempt with a later submission is no longer the active
-- fact for that order. Mark it superseded so it cannot be resurrected.
UPDATE public.delivery_attempts older
SET runner_decision = 'SUPERSEDED',
    superseded_at = (
      SELECT newer.submitted_at
      FROM public.delivery_attempts newer
      WHERE newer.order_id = older.order_id
        AND newer.submitted_at > older.submitted_at
      ORDER BY newer.submitted_at, newer.created_at, newer.id
      LIMIT 1
    )
WHERE older.runner_decision = 'PENDING'
  AND older.superseded_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.delivery_attempts newer
    WHERE newer.order_id = older.order_id
      AND newer.submitted_at > older.submitted_at
  );

-- Final canonical states are also conclusive for the small set of legacy
-- rows that have no matching decision audit: a delivered Driver submission
-- belongs to the delivered order, while cancelled orders cannot be pending
-- review anymore.
UPDATE public.delivery_attempts da
SET runner_decision = 'ACCEPTED',
    runner_decision_at = COALESCE(o.delivered_at, o.updated_at, da.submitted_at)
FROM public.orders o
WHERE da.order_id = o.id
  AND da.runner_decision = 'PENDING'
  AND da.superseded_at IS NULL
  AND da.result_type = 'DRIVER_DELIVERED_SUBMITTED'
  AND da.driver_id = o.driver_id
  AND o.current_operational_state = 'DELIVERED'
  AND o.runner_status::text = 'DELIVERED';

UPDATE public.delivery_attempts da
SET runner_decision = 'SUPERSEDED',
    superseded_at = COALESCE(o.updated_at, da.submitted_at)
FROM public.orders o
WHERE da.order_id = o.id
  AND da.runner_decision = 'PENDING'
  AND da.superseded_at IS NULL
  AND o.current_operational_state = 'CANCELLED';

NOTIFY pgrst, 'reload schema';

COMMIT;
