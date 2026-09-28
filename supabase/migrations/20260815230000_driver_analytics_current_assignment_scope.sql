BEGIN;

-- Current Driver Analytics must use current orders.driver_id ownership.
-- Historical assignment evidence remains available in audit tables, but it
-- must not inherit the current order state or current payment result into a
-- Driver who no longer owns the order.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'private.get_driver_analytics_cohort(uuid,date,date)'::regprocedure
  ) INTO v_definition;

  -- The migration was already applied manually in production through the
  -- Supabase SQL editor. Keep future db push/replay runs safe and idempotent.
  IF strpos(v_definition, 'OR history.order_id IS NOT NULL') = 0 THEN
    RETURN;
  END IF;

  v_definition := replace(
    v_definition,
    '(o.driver_id = p_driver_id OR history.order_id IS NOT NULL)',
    '(o.driver_id = p_driver_id)'
  );
  v_definition := replace(
    v_definition,
    '(o.driver_id = p_driver_id OR COALESCE(history.delivered_submitted, false))',
    '(o.driver_id = p_driver_id)'
  );
  v_definition := replace(
    v_definition,
    '(o.driver_id = p_driver_id OR COALESCE(history.failed_submitted, false))',
    '(o.driver_id = p_driver_id)'
  );
  v_definition := replace(
    v_definition,
    '(o.driver_id = p_driver_id OR COALESCE(history.has_attempt, false))',
    '(o.driver_id = p_driver_id)'
  );

  IF strpos(v_definition, 'WHERE (o.driver_id = p_driver_id)') = 0
    OR strpos(v_definition, 'history.order_id IS NOT NULL') > 0
  THEN
    RAISE EXCEPTION 'Current Driver ownership patch did not match the deployed cohort';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) FROM PUBLIC;

COMMENT ON FUNCTION private.get_driver_analytics_cohort(uuid, date, date) IS
  'Driver Analytics is attributed only to the order current driver; historical assignments do not inherit current payment results.';

NOTIFY pgrst, 'reload schema';

COMMIT;
