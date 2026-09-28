-- Receipt/claim events update payment evidence only. They are not lifecycle
-- transitions, so a delivered order must not be projected back to Booking Sales.
-- This is intentionally a read-only history projection change.

CREATE OR REPLACE FUNCTION public.order_journey_event_location(
  p_action text DEFAULT NULL,
  p_new_status text DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_result_type text DEFAULT NULL,
  p_decision text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, private, pg_temp
AS $$
  WITH normalized_values AS (
    SELECT
      upper(trim(coalesce(p_action, ''))) AS action_name,
      upper(trim(coalesce(p_result_type, ''))) AS result_name,
      upper(trim(coalesce(p_decision, ''))) AS decision_name,
      upper(trim(coalesce(p_new_status, ''))) AS new_status,
      lower(regexp_replace(trim(coalesce(p_failure_reason, '')), '\\s+', ' ', 'g')) AS failure_reason,
      CASE
        WHEN lower(coalesce(p_after ->> 'salesperson_action_required', '')) = 'true' THEN true
        WHEN lower(coalesce(p_after ->> 'salesperson_action_required', '')) = 'false' THEN false
        ELSE NULL
      END AS action_required
  )
  SELECT CASE
    -- Receipt events are audit-only. Even legacy BOOKING projections are
    -- neutralized; the timeline inherits the previous lifecycle tab.
    WHEN action_name IN (
      'RECEIPT_UPLOADED',
      'RECEIPT_REUPLOADED',
      'RECEIPT_RE_UPLOADED',
      'CONFIRM RECEIPT',
      'CONFIRM_RECEIPT',
      'RECEIPT_CONFIRM',
      'RECEIPT_CONFIRMED',
      'FORCE_CONFIRM_RECEIPT',
      'RECEIPT_FORCE_CONFIRMED',
      'RECEIPT_REJECTED'
    ) THEN NULL
    -- Runner acceptance is the lifecycle boundary for Driver results.
    WHEN action_name IN ('DRIVER_DELIVERY_ACCEPTED') THEN 'DELIVERED'
    WHEN action_name IN ('DRIVER_FAILURE_ACCEPTED', 'DRIVER_RESCHEDULE_ACCEPTED') THEN 'ACTION_REQUIRED'
    WHEN action_name IN ('DRIVER_DELIVERY_DEFERRED', 'DRIVER_DELIVERY_TOMORROW_ACCEPTED',
                         'DRIVER_REPORT_REJECTED', 'ACTION_REQUIRED_RESOLVED_TO_READY',
                         'DRIVER_BATCH_SCHEDULED_TOMORROW') THEN 'READY'
    WHEN action_name IN ('ORDER_CANCELLED', 'ORDER CANCELED', 'CANCEL_ORDER', 'CANCELLED') THEN 'CANCELLED'
    -- Runner decision rows are immutable delivery-attempt evidence.
    WHEN decision_name IN ('ACCEPTED', 'ACCEPT')
      AND result_name IN ('DRIVER_DELIVERED_SUBMITTED', 'DRIVER_DELIVERED') THEN 'DELIVERED'
    WHEN decision_name IN ('ACCEPTED', 'ACCEPT')
      AND result_name IN ('DRIVER_DELIVERY_TOMORROW_SUBMITTED') THEN 'READY'
    WHEN decision_name IN ('ACCEPTED', 'ACCEPT')
      AND result_name IN ('DRIVER_FAILED_SUBMITTED', 'DRIVER_RESCHEDULE_SUBMITTED') THEN
      CASE WHEN failure_reason = 'delivery tomorrow' THEN 'READY' ELSE 'ACTION_REQUIRED' END
    WHEN decision_name IN ('REJECTED', 'REJECT') THEN 'READY'
    -- Some legacy audit rows store a compact four-part status string.
    WHEN split_part(new_status, ' / ', 2) = 'DELIVERED' THEN 'DELIVERED'
    WHEN split_part(new_status, ' / ', 2) = 'FAILED_DELIVERY' THEN 'ACTION_REQUIRED'
    WHEN new_status IN ('BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED') THEN new_status
    WHEN split_part(new_status, ' / ', 1) IN ('BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED')
      THEN split_part(new_status, ' / ', 1)
    -- Newer audit snapshots can be resolved with the database canonical rule.
    WHEN upper(coalesce(p_after ->> 'current_operational_state', '')) IN
      ('BOOKING', 'READY', 'ACTION_REQUIRED', 'DELIVERED', 'CANCELLED')
      THEN upper(p_after ->> 'current_operational_state')
    WHEN p_after ?| ARRAY[
      'status', 'operational_status', 'runner_status', 'runner_review_status',
      'runner_final_outcome', 'salesperson_action_required'
    ]
      THEN private.order_current_operational_state(
        p_after ->> 'status',
        p_after ->> 'operational_status',
        p_after ->> 'runner_status',
        p_after ->> 'runner_review_status',
        p_after ->> 'runner_final_outcome',
        action_required
      )
    ELSE NULL
  END
  FROM normalized_values;
$$;

GRANT EXECUTE ON FUNCTION public.order_journey_event_location(text, text, jsonb, text, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
