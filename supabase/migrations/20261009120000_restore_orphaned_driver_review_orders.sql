-- Restore the current order projection for Driver submissions that survived
-- an older Runner Take release with driver_id cleared.
-- The immutable delivery_attempts row remains the source of truth.

BEGIN;

-- This controlled projection repair is the canonical Driver-submission path;
-- use the same internal trigger bypass as the Driver submission RPCs.
SELECT set_config('app.driver_submission', 'true', true);

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
    da.submitted_at,
    batch.created_at AS assignment_created_at,
    batch.created_by AS assignment_created_by
  FROM public.delivery_attempts da
  LEFT JOIN public.driver_assignment_batches batch
    ON batch.id = da.active_assignment_id
  WHERE da.runner_decision = 'PENDING'
    AND da.superseded_at IS NULL
    AND da.driver_id IS NOT NULL
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
  'PENDING_DRIVER_REVIEW_PROJECTION_RESTORED',
  NULL,
  jsonb_build_object(
    'driver_id', o.driver_id,
    'driver_status', o.driver_status,
    'driver_assignment_batch_id', o.driver_assignment_batch_id,
    'runner_accept_status', o.runner_accept_status,
    'runner_review_status', o.runner_review_status
  ),
  jsonb_build_object(
    'driver_id', attempt.driver_id,
    'driver_status', CASE
      WHEN attempt.result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN 'DRIVER_DELIVERED'
      ELSE 'DRIVER_FAILED'
    END,
    'driver_assignment_batch_id', attempt.active_assignment_id,
    'delivery_attempt_id', attempt.attempt_id,
    'reason', 'Restore orphaned Driver result for Runner review queue'
  )
FROM public.orders o
JOIN latest_pending_attempt attempt ON attempt.order_id = o.id
WHERE o.driver_id IS NULL
  AND o.current_operational_state = 'READY'
  AND o.runner_status::text IN ('ASSIGNED', 'TAKEN')
  AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
  AND o.status::text NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED');

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
    da.submitted_at,
    batch.created_at AS assignment_created_at,
    batch.created_by AS assignment_created_by
  FROM public.delivery_attempts da
  LEFT JOIN public.driver_assignment_batches batch
    ON batch.id = da.active_assignment_id
  WHERE da.runner_decision = 'PENDING'
    AND da.superseded_at IS NULL
    AND da.driver_id IS NOT NULL
  ORDER BY da.order_id, da.submitted_at DESC, da.created_at DESC, da.id DESC
)
UPDATE public.orders o
SET driver_id = attempt.driver_id,
    driver_status = CASE
      WHEN attempt.result_type = 'DRIVER_DELIVERED_SUBMITTED' THEN 'DRIVER_DELIVERED'
      ELSE 'DRIVER_FAILED'
    END,
    driver_assignment_batch_id = attempt.active_assignment_id,
    driver_assigned_at = COALESCE(o.driver_assigned_at, attempt.assignment_created_at),
    driver_assigned_by = COALESCE(o.driver_assigned_by, attempt.assignment_created_by),
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
    runner_reviewed_at = NULL,
    runner_reviewed_by = NULL,
    runner_final_outcome = NULL,
    runner_comment = NULL,
    updated_at = now()
FROM latest_pending_attempt attempt
WHERE attempt.order_id = o.id
  AND o.driver_id IS NULL
  AND o.current_operational_state = 'READY'
  AND o.runner_status::text IN ('ASSIGNED', 'TAKEN')
  AND COALESCE(o.runner_review_status::text, 'NOT_REVIEWED') <> 'REVIEWED'
  AND o.status::text NOT IN ('CANCELLED', 'CANCELED', 'RETURNED', 'REFUNDED');

NOTIFY pgrst, 'reload schema';

COMMIT;
