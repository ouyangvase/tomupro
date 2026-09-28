-- A Driver report is reference data until Runner review. In particular,
-- DRIVER_FAILED must not become ACTION_REQUIRED while Runner acceptance is
-- still pending. The review marker is set to REVIEWED by the Runner accept
-- path, so it is the canonical acceptance boundary available to this helper.
CREATE OR REPLACE FUNCTION private.order_current_operational_state(
  p_status text,
  p_operational_status text,
  p_runner_status text,
  p_runner_review_status text,
  p_runner_final_outcome text,
  p_salesperson_action_required boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN upper(coalesce(p_status, '')) = 'CANCELLED'
      OR upper(coalesce(p_operational_status, '')) IN ('CANCELLED', 'RETURNED', 'REFUNDED')
      OR upper(coalesce(p_runner_status, '')) IN ('CANCELLED', 'RETURNED', 'REFUNDED')
      THEN 'CANCELLED'
    WHEN upper(coalesce(p_runner_status, '')) = 'DELIVERED'
      OR upper(coalesce(p_operational_status, '')) = 'DELIVERED_FINAL'
      THEN 'DELIVERED'
    WHEN coalesce(p_salesperson_action_required, false)
      OR upper(coalesce(p_runner_review_status, '')) = 'ACTION_REQUIRED'
      OR upper(coalesce(p_runner_final_outcome, '')) = 'NEED_SALESPERSON_FOLLOWUP'
      OR (
        upper(coalesce(p_runner_status, '')) = 'FAILED_DELIVERY'
        AND upper(coalesce(p_status, '')) = 'READY'
        AND upper(coalesce(p_runner_review_status, '')) = 'REVIEWED'
      )
      THEN 'ACTION_REQUIRED'
    WHEN upper(coalesce(p_status, '')) = 'BOOKING'
      OR upper(coalesce(p_operational_status, '')) IN ('RESCHEDULED', 'BOOKING_AUTO_RESCHEDULE', 'BOOKING_MANUAL')
      THEN 'BOOKING'
    WHEN upper(coalesce(p_status, '')) = 'READY'
      THEN 'READY'
    ELSE 'BOOKING'
  END;
$$;

NOTIFY pgrst, 'reload schema';
