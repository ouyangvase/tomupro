-- Run against a disposable database after the partial-payment migration.
-- This exercises real order/payment/receipt/acceptance functions and rolls back.
BEGIN;
CREATE FUNCTION pg_temp.assert_payment(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF; END;
$$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('10000000-0000-4000-8000-000000000001','payment-admin@test.invalid','{"display_name":"Payment admin"}'),
 ('10000000-0000-4000-8000-000000000002','payment-runner@test.invalid','{"display_name":"Payment runner"}'),
 ('10000000-0000-4000-8000-000000000003','payment-driver@test.invalid','{"display_name":"Payment driver"}');
UPDATE public.profiles SET role = 'admin' WHERE id = '10000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role = 'runner' WHERE id = '10000000-0000-4000-8000-000000000002';
UPDATE public.profiles SET role = 'driver' WHERE id = '10000000-0000-4000-8000-000000000003';

DO $$
#variable_conflict use_variable
DECLARE
  admin_id uuid := '10000000-0000-4000-8000-000000000001';
  runner_id uuid := '10000000-0000-4000-8000-000000000002';
  driver_id uuid := '10000000-0000-4000-8000-000000000003';
  order_id uuid;
  other_id uuid;
  result jsonb;
  report jsonb;
  amount numeric;
  blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  FOREACH amount IN ARRAY ARRAY[0,30,72] LOOP
    result := public.create_order_with_payment(jsonb_build_object(
      'order_code','PP-TEST-' || amount, 'customer_name','Payment test','phone','1234567','address','Test address',
      'total_amount',72,'total_qty',1,'status','READY','salesperson_id',admin_id,
      'receipt_url',CASE WHEN amount > 0 THEN 'https://example.test/receipt-' || amount || '.jpg' END), amount);
    order_id := (result->>'id')::uuid;
    PERFORM pg_temp.assert_payment((SELECT total_amount = 72 FROM public.orders WHERE id = order_id), 'sales remains 72');
    PERFORM pg_temp.assert_payment(private.order_cod_due_amount(order_id) = 72, 'unconfirmed transfer is not paid');
    IF amount > 0 THEN
      result := public.confirm_order_receipt(order_id,admin_id);
      PERFORM pg_temp.assert_payment((result->>'success')::boolean, 'receipt confirms');
      PERFORM public.confirm_order_receipt(order_id,admin_id);
      PERFORM pg_temp.assert_payment((SELECT count(*) = 1 FROM public.order_payments p WHERE p.order_id = order_id), 'confirmation retry does not duplicate payment');
    END IF;
    PERFORM pg_temp.assert_payment(private.order_cod_due_amount(order_id) = 72 - amount, 'confirmed COD balance');
  END LOOP;

  SELECT id INTO order_id FROM public.orders WHERE order_code='PP-TEST-30';
  SELECT id INTO other_id FROM public.orders WHERE order_code='PP-TEST-0';
  blocked := false;
  BEGIN
    UPDATE public.order_payments SET order_id=other_id WHERE id=(SELECT p.id FROM public.order_payments p WHERE p.order_id=order_id LIMIT 1);
  EXCEPTION WHEN OTHERS THEN blocked := SQLERRM LIKE '%cannot be moved%'; END;
  PERFORM pg_temp.assert_payment(blocked,'cross-order payment move rejected');
  blocked := false;
  BEGIN PERFORM public.set_order_payment_plan(order_id,'PARTIAL_TRANSFER_COD',31,'https://example.test/replaced.jpg','edit');
  EXCEPTION WHEN OTHERS THEN blocked := SQLERRM LIKE '%Confirmed payments%'; END;
  PERFORM pg_temp.assert_payment(blocked,'confirmed payment is immutable');

  FOREACH amount IN ARRAY ARRAY[-1,80,30.001] LOOP
    blocked := false;
    BEGIN PERFORM public.set_order_payment_plan(other_id,'PARTIAL_TRANSFER_COD',amount,'https://example.test/receipt.jpg','invalid');
    EXCEPTION WHEN OTHERS THEN blocked := true; END;
    PERFORM pg_temp.assert_payment(blocked,'invalid BND amount rejected');
  END LOOP;
  blocked := false;
  BEGIN PERFORM public.set_order_payment_plan(other_id,'PARTIAL_TRANSFER_COD',30,'http://example.test/receipt.jpg','invalid');
  EXCEPTION WHEN OTHERS THEN blocked := SQLERRM LIKE '%HTTPS%'; END;
  PERFORM pg_temp.assert_payment(blocked,'HTTP receipt rejected');
  blocked := false;
  BEGIN PERFORM public.set_order_payment_plan(other_id,'PARTIAL_TRANSFER_COD',30,NULL,'invalid');
  EXCEPTION WHEN OTHERS THEN blocked := SQLERRM LIKE '%HTTPS%'; END;
  PERFORM pg_temp.assert_payment(blocked,'missing receipt rejected');

  INSERT INTO public.runner_drivers(runner_id,driver_id,is_active) VALUES(runner_id,driver_id,true);
  UPDATE public.orders SET runner_id=runner_id,driver_id=driver_id,runner_status='ASSIGNED',driver_status='ASSIGNED' WHERE id=other_id;
  PERFORM public.set_order_payment_plan(other_id,'PARTIAL_TRANSFER_COD',30,'https://example.test/assigned.jpg','payment after assignment');
  PERFORM public.set_order_payment_plan(other_id,'PARTIAL_TRANSFER_COD',30,'https://example.test/assigned.jpg','retry');
  PERFORM pg_temp.assert_payment((SELECT count(*) = 1 FROM public.order_payments p WHERE p.order_id = other_id),'save retry keeps one transfer');
  blocked := false;
  BEGIN UPDATE public.orders SET driver_status='DRIVER_DELIVERED',driver_cash_amount=42,driver_transfer_amount=0,driver_payment_method='CASH' WHERE id=other_id;
  EXCEPTION WHEN OTHERS THEN blocked := SQLERRM LIKE '%Receipt must be confirmed%'; END;
  PERFORM pg_temp.assert_payment(blocked,'Driver pending receipt gate');
  PERFORM set_config('request.jwt.claim.sub',runner_id::text,true);
  result := public.confirm_order_receipt(other_id,runner_id);
  PERFORM pg_temp.assert_payment((result->>'success')::boolean,'assigned Runner confirms transfer');
  blocked := false;
  BEGIN UPDATE public.orders SET driver_cash_amount=72,driver_transfer_amount=0,driver_payment_method='CASH' WHERE id=other_id;
  EXCEPTION WHEN OTHERS THEN blocked := SQLERRM LIKE '%exceed COD%'; END;
  PERFORM pg_temp.assert_payment(blocked,'stale Driver collection 72 rejected');
  PERFORM set_config('request.jwt.claim.sub',driver_id::text,true);
  UPDATE public.orders SET driver_status='DRIVER_FAILED',driver_failed_at=now(),driver_failed_reason='Delivery Tomorrow',
    driver_next_delivery_date=(now() AT TIME ZONE 'Asia/Brunei')::date+1,runner_accept_status='PENDING',runner_review_status='NOT_REVIEWED' WHERE id=other_id;
  PERFORM pg_temp.assert_payment(private.order_cod_due_amount(other_id)=42,'failure retains transfer');
  PERFORM set_config('request.jwt.claim.sub',runner_id::text,true);
  result := public.review_driver_delivery(other_id,runner_id,true,NULL);
  PERFORM pg_temp.assert_payment((result->>'success')::boolean AND private.order_cod_due_amount(other_id)=42,'reschedule review retains transfer');
  UPDATE public.orders SET driver_id=driver_id,driver_status='ASSIGNED',runner_review_status='NOT_REVIEWED',runner_accept_status='PENDING' WHERE id=other_id;
  PERFORM set_config('request.jwt.claim.sub',driver_id::text,true);
  UPDATE public.orders SET driver_status='DRIVER_DELIVERED',driver_delivered_at=now(),driver_cash_amount=40,driver_transfer_amount=0,driver_payment_method='CASH',runner_accept_status='PENDING' WHERE id=other_id;
  PERFORM pg_temp.assert_payment((SELECT outstanding_amount=2 AND total_collected=70 FROM public.get_order_payment_summary(other_id)), 'undercollection remains outstanding');
  UPDATE public.orders SET driver_cash_amount=42 WHERE id=other_id;
  PERFORM set_config('request.jwt.claim.sub',runner_id::text,true);
  result := public.review_driver_delivery(other_id,runner_id,true,NULL);
  PERFORM pg_temp.assert_payment((result->>'success')::boolean,'Runner accepts Driver delivery');
  PERFORM public.review_driver_delivery(other_id,runner_id,true,NULL);
  PERFORM pg_temp.assert_payment((SELECT count(*)=1 AND sum(cash_amount)=42 FROM public.cash_liabilities l WHERE l.order_id=other_id),'accept/retry creates cash liability 42 once');
  PERFORM pg_temp.assert_payment((SELECT total_collected=72 AND outstanding_amount=0 FROM public.get_order_payment_summary(other_id)), 'fully collected 72');
  blocked := false;
  BEGIN UPDATE public.orders SET driver_cash_amount=40 WHERE id=other_id;
  EXCEPTION WHEN OTHERS THEN blocked := SQLERRM LIKE '%finance correction%'; END;
  PERFORM pg_temp.assert_payment(blocked,'accepted cash cannot drift from its liability');
  PERFORM public.get_delivered_orders_fast(runner_id,NULL,NULL,100,0);
  report := public.get_finance_payment_breakdown(runner_id,NULL,(now() AT TIME ZONE 'Asia/Brunei')::date,(now() AT TIME ZONE 'Asia/Brunei')::date);
  PERFORM pg_temp.assert_payment((report#>>'{summary,salesValue}')::numeric=72 AND (report#>>'{summary,transferPaid}')::numeric=30
    AND (report#>>'{summary,codCollected}')::numeric=42 AND (report#>>'{summary,outstanding}')::numeric=0,'Finance reconciles 72/30/42: ' || report::text);
  PERFORM pg_temp.assert_payment(NOT has_table_privilege('authenticated','public.order_payments','INSERT'),'no direct authenticated payment inserts');
  -- Remaining payment made by transfer creates no Driver cash liability.
  SELECT id INTO order_id FROM public.orders WHERE order_code='PP-TEST-30';
  UPDATE public.orders SET runner_id=runner_id,driver_id=driver_id,runner_status='ASSIGNED',driver_status='DRIVER_DELIVERED',
    driver_delivered_at=now(),driver_cash_amount=0,driver_transfer_amount=42,driver_payment_method='TRANSFER',runner_accept_status='PENDING',runner_review_status='NOT_REVIEWED' WHERE id=order_id;
  result := public.review_driver_delivery(order_id,runner_id,true,NULL);
  PERFORM pg_temp.assert_payment((result->>'success')::boolean,'Runner accepts remaining transfer');
  PERFORM pg_temp.assert_payment(NOT EXISTS(SELECT 1 FROM public.cash_liabilities l WHERE l.order_id=order_id),'transfer delivery creates no cash liability');
  PERFORM pg_temp.assert_payment((SELECT total_collected=72 AND outstanding_amount=0 FROM public.get_order_payment_summary(order_id)),'30 plus 42 transfer reconciles');
  SELECT id INTO order_id FROM public.orders WHERE order_code='PP-TEST-72';
  UPDATE public.orders SET runner_id=runner_id,driver_id=driver_id,runner_status='ASSIGNED',driver_status='DRIVER_DELIVERED',
    driver_delivered_at=now(),driver_cash_amount=0,driver_transfer_amount=0,driver_payment_method='TRANSFER',runner_accept_status='PENDING',runner_review_status='NOT_REVIEWED' WHERE id=order_id;
  result := public.review_driver_delivery(order_id,runner_id,true,NULL);
  PERFORM pg_temp.assert_payment((result->>'success')::boolean,'Full transfer delivers without new collection');
  PERFORM pg_temp.assert_payment(NOT EXISTS(SELECT 1 FROM public.cash_liabilities l WHERE l.order_id=order_id),'full pretransfer creates no cash liability');
  PERFORM pg_temp.assert_payment(NOT has_function_privilege('anon','public.set_order_payment_plan(uuid,text,numeric,text,text,numeric)','EXECUTE'),'anonymous payment RPC denied');
END;
$$;

-- Exercise order creation under the actual authenticated role and insert RLS.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE created jsonb; blocked boolean := false;
BEGIN
  created := public.create_order_with_payment(jsonb_build_object('id','10000000-0000-4000-8000-000000000099',
    'order_code','PP-AUTHENTICATED','customer_name','Authenticated test','phone','1234567','address','Test address',
    'total_amount',72,'total_qty',1,'receipt_url','https://example.test/authenticated.jpg'),30);
  PERFORM pg_temp.assert_payment((created->>'cod_amount')::numeric=42,'RLS-preserving creation computes COD');
  BEGIN
    PERFORM public.create_order_with_payment(jsonb_build_object('id','10000000-0000-4000-8000-000000000099',
      'order_code','PP-AUTHENTICATED','customer_name','Authenticated test','phone','1234567','address','Test address',
      'total_amount',72,'total_qty',1,'receipt_url','https://example.test/authenticated.jpg'),30);
  EXCEPTION WHEN unique_violation THEN blocked := true; END;
  PERFORM pg_temp.assert_payment(blocked,'duplicate create is rejected without a second order/payment');
END;
$$;
RESET ROLE;
ROLLBACK;
