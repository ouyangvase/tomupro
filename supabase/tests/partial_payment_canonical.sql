-- Execute only inside a transaction and roll back these synthetic records.
CREATE FUNCTION pg_temp.assert_payment(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF; END;
$$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('10000000-0000-4000-8000-000000000001','payment-admin@test.invalid','{"display_name":"Payment admin"}'),
 ('10000000-0000-4000-8000-000000000002','payment-runner@test.invalid','{"display_name":"Payment runner"}'),
 ('10000000-0000-4000-8000-000000000003','payment-driver@test.invalid','{"display_name":"Payment driver"}');
UPDATE public.profiles SET role='admin',is_active=true WHERE id='10000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role='runner',is_active=true WHERE id='10000000-0000-4000-8000-000000000002';
UPDATE public.profiles SET role='driver',is_active=true WHERE id='10000000-0000-4000-8000-000000000003';
DO $$
#variable_conflict use_variable
DECLARE
 admin_id uuid := '10000000-0000-4000-8000-000000000001';
 runner_id uuid := '10000000-0000-4000-8000-000000000002';
 driver_id uuid := '10000000-0000-4000-8000-000000000003';
 order_id uuid; batch_id uuid; submission_id uuid; result jsonb; amount numeric; blocked boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 INSERT INTO public.runner_drivers(runner_id,driver_id,is_active) VALUES(runner_id,driver_id,true);
 INSERT INTO public.reasons(reason_type,label,is_active,created_by) SELECT 'FAILED_DELIVERY','Customer Requested Reschedule',true,admin_id WHERE NOT EXISTS(SELECT 1 FROM public.reasons WHERE reason_type='FAILED_DELIVERY' AND lower(label)='customer requested reschedule' AND is_active);
 FOREACH amount IN ARRAY ARRAY[0,30,72] LOOP
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  result := public.create_order_with_payment(jsonb_build_object('order_code','PP-RELEASE-'||amount,
   'customer_name','Release rollback test','phone','0000000','address','Test','area','B1',
   'total_amount',72,'total_qty',1,'status','READY','salesperson_id',admin_id,
   'receipt_url',CASE WHEN amount>0 THEN 'https://example.test/receipt.jpg' END),amount);
  order_id := (result->>'id')::uuid;
  UPDATE public.orders SET runner_id=runner_id,runner_status='ASSIGNED' WHERE id=order_id;
  PERFORM set_config('request.jwt.claim.sub',runner_id::text,true);
  INSERT INTO public.driver_assignment_batches(operational_date,action,created_by,new_driver_id,selected_order_count,selected_collect_amount)
   VALUES(current_date,'ASSIGN',runner_id,driver_id,1,72) RETURNING id INTO batch_id;
  UPDATE public.orders SET runner_id=runner_id,driver_id=driver_id,runner_status='ASSIGNED',driver_status='ASSIGNED',
   driver_assignment_batch_id=batch_id,driver_assigned_at=now() WHERE id=order_id;
  PERFORM pg_temp.assert_payment(private.order_cod_due_amount(order_id)=72,'pending is not paid');
  IF amount>0 THEN
   PERFORM set_config('request.jwt.claim.sub',runner_id::text,true);
   result := public.confirm_order_receipt(order_id,runner_id);
   PERFORM pg_temp.assert_payment((result->>'success')::boolean,'Runner confirms');
   PERFORM public.confirm_order_receipt(order_id,runner_id);
  END IF;
  PERFORM pg_temp.assert_payment(private.order_cod_due_amount(order_id)=72-amount,'correct COD');
  PERFORM set_config('request.jwt.claim.sub',driver_id::text,true);
  IF amount>0 THEN
   blocked:=false;
   BEGIN PERFORM public.submit_driver_payment_result(order_id,'CASH',72,0,gen_random_uuid());
   EXCEPTION WHEN OTHERS THEN blocked:=SQLERRM LIKE '%COD balance%'; END;
   PERFORM pg_temp.assert_payment(blocked,'stale cash rejected');
  END IF;
  IF amount=30 THEN
   BEGIN
   INSERT INTO public.attachments(order_id,type,url,uploaded_by) VALUES(order_id,'delivery_photo','https://example.test/delivery-proof.jpg',driver_id);
   result:=public.submit_driver_delivery_result(order_id,'DRIVER_FAILED_SUBMITTED',NULL,NULL,'Customer Requested Reschedule',NULL,current_date+2,gen_random_uuid(),'["https://example.test/delivery-proof.jpg"]','NEW');
   PERFORM pg_temp.assert_payment((result->>'success')::boolean AND private.order_cod_due_amount(order_id)=42,'failed reschedule preserves transfer');
   PERFORM set_config('request.jwt.claim.sub',runner_id::text,true);
   result:=public.review_driver_delivery(order_id,runner_id,true,NULL);
   PERFORM pg_temp.assert_payment((result->>'success')::boolean AND private.order_cod_due_amount(order_id)=42,'Runner reschedule preserves transfer');
   RAISE EXCEPTION USING ERRCODE='P9001', MESSAGE='Restore pre-reschedule fixture';
   EXCEPTION WHEN SQLSTATE 'P9001' THEN NULL;
   END;
  END IF;
  submission_id:=gen_random_uuid();
  result:=public.submit_driver_payment_result(order_id,'CASH',72-amount,0,submission_id);
  PERFORM pg_temp.assert_payment((result->>'success')::boolean,'canonical Driver submit');
  result:=public.submit_driver_payment_result(order_id,'CASH',72-amount,0,submission_id);
  PERFORM pg_temp.assert_payment((result->>'duplicate')::boolean,'idempotent Driver retry');
  PERFORM pg_temp.assert_payment((SELECT count(*)=1 AND max(cash_amount)=72-amount FROM public.delivery_attempts d WHERE d.order_id=order_id AND d.result_type='DRIVER_DELIVERED_SUBMITTED'),'one actual collection');
  PERFORM set_config('request.jwt.claim.sub',runner_id::text,true);
  result:=public.review_driver_delivery(order_id,runner_id,true,NULL);
  PERFORM pg_temp.assert_payment((result->>'success')::boolean,'Runner Accept');
  PERFORM public.review_driver_delivery(order_id,runner_id,true,NULL);
  PERFORM pg_temp.assert_payment((SELECT total_amount=72 AND driver_cash_amount=72-amount AND runner_status='DELIVERED' FROM public.orders WHERE id=order_id),'sales and collection remain separate');
  PERFORM pg_temp.assert_payment((SELECT COALESCE(sum(cash_amount),0)=72-amount AND count(*)<=1 FROM public.cash_liabilities c WHERE c.order_id=order_id),'cash liability is actual cash only');
  PERFORM pg_temp.assert_payment((SELECT outstanding_amount=0 FROM public.get_order_payment_summary(order_id)),'no remaining debt');
 END LOOP;
END;
$$;
SELECT 'canonical_collection_tests_passed' AS result;
