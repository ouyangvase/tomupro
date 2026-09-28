-- Order Journey must show the order's real destination tab at each event.
-- Older audit rows do not always contain current_operational_state, so this
-- projection uses the same canonical lifecycle rules plus the recorded action
-- boundary. It never updates orders or rewrites history.

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

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.get_order_journey(text[],date,date,timestamptz)'::regprocedure;
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(v_signature) INTO v_definition;

  IF strpos(v_definition, '''order_location''') > 0 THEN
    RETURN;
  END IF;

  IF strpos(v_definition, E'da.runner_decision,\n              da.runner_decision_at,\n              da.superseded_at,') = 0 THEN
    RAISE EXCEPTION 'get_order_journey driver action projection was not recognized';
  END IF;

  v_definition := replace(
    v_definition,
    E'da.runner_decision,\n              da.runner_decision_at,\n              da.superseded_at,',
    E'da.runner_decision,\n              da.runner_decision_at,\n              public.order_journey_event_location(\n                NULL, NULL, NULL, da.result_type, da.runner_decision, da.failure_reason\n              ) AS order_location,\n              da.superseded_at,'
  );

  IF strpos(v_definition, E'da.result_type,\n              da.reschedule_date,\n              ''delivery_attempt'' AS source') = 0 THEN
    RAISE EXCEPTION 'get_order_journey runner decision projection was not recognized';
  END IF;

  v_definition := replace(
    v_definition,
    E'da.result_type,\n              da.reschedule_date,\n              ''delivery_attempt'' AS source',
    E'da.result_type,\n              da.failure_reason,\n              da.reschedule_date,\n              public.order_journey_event_location(\n                NULL, NULL, NULL, da.result_type, da.runner_decision, da.failure_reason\n              ) AS order_location,\n              ''delivery_attempt'' AS source'
  );

  IF strpos(v_definition, E'''new_status'', al.new_status,\n            ''metadata'', jsonb_build_object(''before'', al.before_json, ''after'', al.after_json)') = 0 THEN
    RAISE EXCEPTION 'get_order_journey lifecycle projection was not recognized';
  END IF;

  v_definition := replace(
    v_definition,
    E'''new_status'', al.new_status,\n            ''metadata'', jsonb_build_object(''before'', al.before_json, ''after'', al.after_json)',
    E'''new_status'', al.new_status,\n            ''order_location'', public.order_journey_event_location(\n              COALESCE(al.action_type, al.action), al.new_status, al.after_json, NULL, NULL, NULL\n            ),\n            ''metadata'', jsonb_build_object(''before'', al.before_json, ''after'', al.after_json)'
  );

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_journey(text[], date, date, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
