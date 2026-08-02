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

-- Driver event timestamps use the Brunei calendar boundary.
SELECT pg_temp.assert_true(
  private.driver_analytics_event_date(TIMESTAMPTZ '2026-08-01 16:30:00+00') = DATE '2026-08-02',
  '01 driver-delivered event uses Asia/Brunei'
);

-- The same instant can never be grouped under its earlier UTC date.
SELECT pg_temp.assert_true(
  private.driver_analytics_event_date(TIMESTAMPTZ '2026-08-01 06:59:33+00') = DATE '2026-08-01',
  '02 assignment time does not replace the delivery event date'
);

-- A Driver-reported Transfer is attributed entirely to Transfer.
SELECT pg_temp.assert_true(
  (SELECT cash_amount = 0 AND transfer_amount = 39
   FROM private.driver_analytics_reported_payment_components(39, 'COD', 'TRANSFER', 0, 39)),
  '03 Driver Transfer split'
);

-- A Driver-reported Cash payment is attributed entirely to Cash.
SELECT pg_temp.assert_true(
  (SELECT cash_amount = 55 AND transfer_amount = 0
   FROM private.driver_analytics_reported_payment_components(55, 'COD', 'CASH', 55, 0)),
  '04 Driver Cash split'
);

-- Cash and Transfer components reconcile to the reported order amount.
SELECT pg_temp.assert_true(
  (SELECT cash_amount + transfer_amount = 120
   FROM private.driver_analytics_reported_payment_components(120, 'COD', 'CASH_TRANSFER', 80, 40)),
  '05 mixed payment reconciliation'
);

-- Driver-submitted delivery awaiting Runner review is not accepted yet.
SELECT pg_temp.assert_true(
  NOT private.driver_analytics_is_accepted_delivery('DRIVER_DELIVERED', 'PENDING', 'ASSIGNED'),
  '06 pending Runner acceptance'
);

-- Runner acceptance of a Driver delivery is accepted exactly once.
SELECT pg_temp.assert_true(
  private.driver_analytics_is_accepted_delivery('DRIVER_DELIVERED', 'ACCEPTED', 'DELIVERED'),
  '07 Runner accepted Driver delivery'
);

-- Runner-direct delivery without a Driver event remains excluded.
SELECT pg_temp.assert_true(
  NOT private.driver_analytics_is_accepted_delivery(NULL, 'ACCEPTED', 'DELIVERED'),
  '08 Runner-direct delivery excluded'
);

SELECT '8 Driver Analytics event regression tests passed' AS result;

ROLLBACK;
