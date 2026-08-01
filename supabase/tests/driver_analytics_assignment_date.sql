BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_condition, false) THEN
    RAISE EXCEPTION 'Driver Analytics regression failed: %', p_name;
  END IF;
  RETURN p_name;
END;
$$;

-- 1. The actual assignment timestamp is the calendar date.
SELECT pg_temp.assert_true(
  private.driver_analytics_assignment_date(TIMESTAMPTZ '2026-07-05 16:30:00+00', NULL, NULL) = DATE '2026-07-06',
  '01 assignment-date grouping'
);

-- 2. The current order assignment timestamp wins over fallback evidence.
SELECT pg_temp.assert_true(
  private.driver_analytics_assignment_date(
    TIMESTAMPTZ '2026-07-20 04:00:00+00',
    TIMESTAMPTZ '2026-07-21 04:00:00+00',
    TIMESTAMPTZ '2026-07-22 04:00:00+00'
  ) = DATE '2026-07-20',
  '02 unrelated dates excluded'
);

-- 3. A future business/reschedule date never moves Analytics assignment day.
SELECT pg_temp.assert_true(
  private.driver_analytics_assignment_date(
    TIMESTAMPTZ '2026-07-30 10:00:00+00',
    NULL,
    NULL
  ) = DATE '2026-07-30',
  '03 reschedule does not rewrite assignment date'
);

-- 4. UTC timestamps use the Brunei calendar boundary.
SELECT pg_temp.assert_true(
  private.driver_analytics_assignment_date(NULL, TIMESTAMPTZ '2026-07-05 16:30:00+00', NULL) = DATE '2026-07-06',
  '04 Asia/Brunei timezone'
);

-- 5. Only the current assignment remains after reassignment before an attempt.
WITH assignments(order_id, driver_id, is_current, attempted) AS (
  VALUES ('order-1', 'old-driver', false, false), ('order-1', 'new-driver', true, false)
)
SELECT pg_temp.assert_true(
  (SELECT COUNT(*) FROM assignments WHERE is_current) = 1
    AND (SELECT driver_id FROM assignments WHERE is_current) = 'new-driver',
  '05 reassignment before attempt'
);

-- 6. Driver-submitted delivery awaiting Runner review is not accepted.
SELECT pg_temp.assert_true(
  NOT private.driver_analytics_is_accepted_delivery('DRIVER_DELIVERED', 'PENDING', 'ASSIGNED'),
  '06 awaiting Runner acceptance'
);

-- 7. A Runner-accepted Driver delivery counts exactly once.
SELECT pg_temp.assert_true(
  private.driver_analytics_is_accepted_delivery('DRIVER_DELIVERED', 'ACCEPTED', 'DELIVERED'),
  '07 Runner accepted'
);

-- 8. Runner-direct delivery without a Driver attempt is excluded.
SELECT pg_temp.assert_true(
  NOT private.driver_analytics_is_accepted_delivery(NULL, 'ACCEPTED', 'DELIVERED'),
  '08 Runner-direct delivery excluded'
);

-- 9. Delivery Tomorrow remains on its actual assignment day and stays pending.
SELECT pg_temp.assert_true(
  private.driver_analytics_assignment_date(TIMESTAMPTZ '2026-07-06 16:00:00+00', NULL, NULL) = DATE '2026-07-07'
    AND NOT private.driver_analytics_is_accepted_delivery('DRIVER_DELIVERED', 'PENDING', 'ASSIGNED'),
  '09 delivery tomorrow remains pending'
);

-- 10. Multiple history rows still contribute one distinct order.
WITH history(order_id, history_id) AS (
  VALUES ('order-1', 'history-1'), ('order-1', 'history-2'), ('order-1', 'history-3')
)
SELECT pg_temp.assert_true(
  (SELECT COUNT(DISTINCT order_id) FROM history) = 1,
  '10 duplicate assignment history'
);

-- 11. Assigned sales is the sum of the valid assignment cohort only.
WITH cohort(amount, valid) AS (VALUES (55::numeric, true), (69::numeric, true), (500::numeric, false))
SELECT pg_temp.assert_true(
  (SELECT SUM(amount) FILTER (WHERE valid) FROM cohort) = 124,
  '11 total assigned sales'
);

-- 12. Only accepted cash enters Cash Collected.
SELECT pg_temp.assert_true(
  (SELECT cash_amount FROM private.driver_analytics_payment_components(true, 55, 'COD', 'CASH', NULL, NULL)) = 55
    AND (SELECT cash_amount FROM private.driver_analytics_payment_components(false, 55, 'COD', 'CASH', NULL, NULL)) = 0,
  '12 accepted cash only'
);

-- 13. Cash Pending uses only accepted cash with an open settlement liability.
WITH liabilities(accepted, cash_amount, status) AS (
  VALUES (true, 55::numeric, 'OPEN'), (true, 69::numeric, 'SETTLED'), (false, 88::numeric, 'OPEN')
)
SELECT pg_temp.assert_true(
  (SELECT COALESCE(SUM(cash_amount) FILTER (WHERE accepted AND status IN ('OPEN', 'PENDING_HANDOVER')), 0) FROM liabilities) = 55,
  '13 cash pending settlement'
);

-- 14. Only accepted transfer enters Transfer.
SELECT pg_temp.assert_true(
  (SELECT transfer_amount FROM private.driver_analytics_payment_components(true, 69, 'TRANSFER', 'TRANSFER', NULL, NULL)) = 69
    AND (SELECT transfer_amount FROM private.driver_analytics_payment_components(false, 69, 'TRANSFER', 'TRANSFER', NULL, NULL)) = 0,
  '14 accepted transfer only'
);

-- 15. Runner-only terminal outcomes are excluded; Driver-authored outcomes remain eligible.
SELECT pg_temp.assert_true(
  NOT private.driver_analytics_is_outcome_eligible('ASSIGNED', 'DELIVERED', false)
    AND NOT private.driver_analytics_is_outcome_eligible('ASSIGNED', 'FAILED_DELIVERY', false)
    AND private.driver_analytics_is_outcome_eligible('DRIVER_DELIVERED', 'DELIVERED', true)
    AND private.driver_analytics_is_outcome_eligible('DRIVER_FAILED', 'FAILED_DELIVERY', true)
    AND private.driver_analytics_is_outcome_eligible('ASSIGNED', 'TAKEN', false),
  '15 Driver actor evidence'
);

-- 16. Daily cohort totals reconcile to month/year totals.
WITH daily(day, assigned, delivered, amount) AS (
  VALUES
    (DATE '2026-07-06', 3, 2, 165::numeric),
    (DATE '2026-07-07', 2, 1, 100::numeric),
    (DATE '2026-08-01', 4, 4, 220::numeric)
), monthly AS (
  SELECT date_trunc('month', day)::date AS month, SUM(assigned) assigned, SUM(delivered) delivered, SUM(amount) amount
  FROM daily GROUP BY 1
)
SELECT pg_temp.assert_true(
  (SELECT SUM(assigned) FROM daily) = (SELECT SUM(assigned) FROM monthly)
    AND (SELECT SUM(delivered) FROM daily) = (SELECT SUM(delivered) FROM monthly)
    AND (SELECT SUM(amount) FROM daily) = (SELECT SUM(amount) FROM monthly),
  '16 daily monthly yearly reconciliation'
);

SELECT '16 Driver Analytics regression tests passed' AS result;

ROLLBACK;
