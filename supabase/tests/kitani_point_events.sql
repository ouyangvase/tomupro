BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_condition, false) THEN
    RAISE EXCEPTION 'KITANI points regression failed: %', p_name;
  END IF;
  RETURN p_name;
END;
$$;

-- Write as service role, like TOMUPRO RPCs and edge functions.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- handle_new_user creates the matching profile.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-00000000c001', 'kitani-points-test@tomupro.test');

INSERT INTO public.orders (
  id, order_code, customer_name, phone, address, salesperson_id, order_owner_id, total_amount
)
VALUES
  (
    '00000000-0000-4000-8000-00000000a001', 'KPT-TEST-BN', 'Brunei Customer', '+673 812 3456',
    'Test address', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c001', 123.45
  ),
  (
    '00000000-0000-4000-8000-00000000a002', 'KPT-TEST-MY', 'Malaysia Customer', '+60 12-345 6789',
    'Test address', '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c001', 50.00
  );

-- Delivered Brunei order queues one pending row with the canonical phone.
UPDATE public.orders
SET runner_status = 'DELIVERED', delivered_at = now()
WHERE id = '00000000-0000-4000-8000-00000000a001';

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
     AND bool_and(
       order_code = 'KPT-TEST-BN'
       AND phone = '+6738123456'
       AND total_amount_minor = 12345
       AND delivery_status = 'pending'
     )
   FROM public.kitani_point_events
   WHERE tomupro_order_id = '00000000-0000-4000-8000-00000000a001'),
  '01 delivered queues one pending row'
);

CREATE TEMP TABLE delivered_row AS
SELECT *
FROM public.kitani_point_events
WHERE tomupro_order_id = '00000000-0000-4000-8000-00000000a001';

-- Revert, re-delivery and cancel leave the single row unchanged.
UPDATE public.orders
SET runner_status = 'TAKEN'
WHERE id = '00000000-0000-4000-8000-00000000a001';

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
     AND bool_and(to_jsonb(e) = (SELECT to_jsonb(d) FROM delivered_row d))
   FROM public.kitani_point_events e
   WHERE e.tomupro_order_id = '00000000-0000-4000-8000-00000000a001'),
  '02 revert adds no row'
);

UPDATE public.orders
SET runner_status = 'DELIVERED'
WHERE id = '00000000-0000-4000-8000-00000000a001';

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
     AND bool_and(to_jsonb(e) = (SELECT to_jsonb(d) FROM delivered_row d))
   FROM public.kitani_point_events e
   WHERE e.tomupro_order_id = '00000000-0000-4000-8000-00000000a001'),
  '03 re-delivery keeps the single row unchanged'
);

UPDATE public.orders
SET status = 'CANCELLED'
WHERE id = '00000000-0000-4000-8000-00000000a001';

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
     AND bool_and(to_jsonb(e) = (SELECT to_jsonb(d) FROM delivered_row d))
   FROM public.kitani_point_events e
   WHERE e.tomupro_order_id = '00000000-0000-4000-8000-00000000a001'),
  '04 cancel after delivery adds no row'
);

-- A non-Brunei phone is recorded as skipped without a phone.
UPDATE public.orders
SET runner_status = 'DELIVERED', delivered_at = now()
WHERE id = '00000000-0000-4000-8000-00000000a002';

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
     AND bool_and(
       phone IS NULL
       AND delivery_status = 'skipped'
       AND total_amount_minor = 5000
     )
   FROM public.kitani_point_events
   WHERE tomupro_order_id = '00000000-0000-4000-8000-00000000a002'),
  '05 non-Brunei phone is skipped'
);

-- Claim returns due pending rows only and leases them for 5 minutes.
CREATE TEMP TABLE claimed AS
SELECT * FROM public.claim_kitani_point_events();

SELECT pg_temp.assert_true(
  (SELECT count(*) = 1
     AND bool_and(
       tomupro_order_id = '00000000-0000-4000-8000-00000000a001'
       AND next_retry_at = now() + interval '5 minutes'
     )
   FROM claimed
   WHERE tomupro_order_id IN (
     '00000000-0000-4000-8000-00000000a001',
     '00000000-0000-4000-8000-00000000a002'
   )),
  '06 claim returns due pending row with lease'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.claim_kitani_point_events()
    WHERE tomupro_order_id = '00000000-0000-4000-8000-00000000a001'
  ),
  '07 claim skips leased rows'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.claim_kitani_point_events()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.claim_kitani_point_events()', 'EXECUTE'),
  '08 anon and authenticated cannot claim'
);

SELECT '8 KITANI points regression tests passed' AS result;

ROLLBACK;
