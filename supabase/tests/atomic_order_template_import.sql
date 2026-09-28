-- Run against a database with the atomic import migration applied. All fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.fail_test_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.notes='force_failure' THEN RAISE EXCEPTION 'Injected item failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER zz_template_test_failure BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_test_item();CREATE FUNCTION pg_temp.assert_import(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',msg; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('20000000-0000-4000-8000-000000000001','template-rollback@test.invalid','{"display_name":"Template rollback"}');
UPDATE public.profiles SET role='admin',is_active=true WHERE id='20000000-0000-4000-8000-000000000001';
INSERT INTO public.products(id,sku_name,sku_code,owner_user_id,created_by,is_active) VALUES
 ('20000000-0000-4000-8000-000000000002','Template A','TPL-A','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000003','Template B','TPL-B','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
CREATE FUNCTION pg_temp.payment_count(p_id uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT count(*) FROM public.order_payments WHERE order_id=p_id $$;
CREATE FUNCTION pg_temp.payment_sum(p_id uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT sum(amount) FROM public.order_payments WHERE order_id=p_id AND status='CONFIRMED' $$;
CREATE FUNCTION pg_temp.cod_due(p_id uuid) RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT private.order_cod_due_amount(p_id) $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_test_id uuid; data jsonb; items jsonb; result jsonb; transfer numeric; failed boolean; bad_id uuid;
BEGIN
 items := '[{"product_id":"20000000-0000-4000-8000-000000000002","sku_label":"TPL-A","qty":2,"line_total":42},{"product_id":"20000000-0000-4000-8000-000000000003","sku_label":"TPL-B","qty":1,"line_total":30}]';
 FOREACH transfer IN ARRAY ARRAY[0,30,72] LOOP
  v_test_id := gen_random_uuid();
  data := jsonb_build_object('id',v_test_id,'order_code','TPL-ROLLBACK-'||transfer,'customer_name','Template test','phone','0000000','address','Rollback test','order_owner_id',auth.uid(),'status','BOOKING','total_amount',999,'receipt_url',CASE WHEN transfer>0 THEN 'https://example.test/receipt.jpg' END,'notes',E'Call first\nSide entrance / blue gate');
  result := public.import_order_with_payment(data,items,transfer);
  PERFORM pg_temp.assert_import((result->>'total_amount')::numeric=72,'server computes full total');
  PERFORM pg_temp.assert_import(pg_temp.cod_due(v_test_id)=72,'pending transfer does not reduce collection');
  PERFORM pg_temp.assert_import((SELECT count(*)=2 FROM public.order_items WHERE order_id=v_test_id),'two items');
  PERFORM pg_temp.assert_import((SELECT sum(price)=72 AND sum(qty)=3 FROM public.order_items WHERE order_id=v_test_id),'quantity does not multiply money');
  PERFORM public.import_order_with_payment(data,items,transfer);
  PERFORM pg_temp.assert_import((SELECT count(*)=2 FROM public.order_items WHERE order_id=v_test_id),'retry does not duplicate items');
  PERFORM pg_temp.assert_import((pg_temp.payment_count(v_test_id)<=1),'retry does not duplicate payment');
  IF transfer>0 THEN
    PERFORM pg_temp.assert_import((result->>'receipt_status')='pending','receipt remains pending');
    PERFORM public.confirm_order_receipt(v_test_id,auth.uid());
    PERFORM pg_temp.assert_import(pg_temp.cod_due(v_test_id)=72-transfer,'confirmed transfer reduces collection exactly once');
    PERFORM pg_temp.assert_import((pg_temp.payment_sum(v_test_id)=transfer),'confirmed transfer amount');
  END IF;
  failed := false;
  BEGIN PERFORM public.import_order_with_payment(data || '{"notes":"Changed"}',items,transfer); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_import(failed,'changed payload cannot reuse request ID');
 END LOOP;
 FOREACH transfer IN ARRAY ARRAY[-1,73,1.001] LOOP
  bad_id:=gen_random_uuid(); failed:=false;
  BEGIN PERFORM public.import_order_with_payment(data || jsonb_build_object('id',bad_id,'order_code','TPL-BAD-'||transfer),items,transfer); EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert_import(failed,'invalid payment rejected');
  PERFORM pg_temp.assert_import(NOT EXISTS(SELECT 1 FROM public.orders WHERE id=bad_id),'invalid payment leaves no order');
 END LOOP;
 bad_id:=gen_random_uuid(); failed:=false;
 BEGIN PERFORM public.import_order_with_payment(data || jsonb_build_object('id',bad_id,'order_code','TPL-NORECEIPT','receipt_url',NULL),items,30); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 PERFORM pg_temp.assert_import(failed,'missing receipt rejected');
 bad_id:=gen_random_uuid(); failed:=false;
 BEGIN PERFORM public.import_order_with_payment(data || jsonb_build_object('id',bad_id,'order_code','TPL-ITEMFAIL'),jsonb_set(items,'{1,notes}', '"force_failure"'),30); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 -- The test trigger below forces failure after the order was created.
 PERFORM pg_temp.assert_import(failed,'item insert failure reported');
 PERFORM pg_temp.assert_import(NOT EXISTS(SELECT 1 FROM public.orders WHERE id=bad_id),'item failure rolls back order');
 PERFORM pg_temp.assert_import(pg_temp.payment_count(bad_id)=0,'item failure rolls back payment');
END $$;
RESET ROLE;
SELECT 'atomic import rollback checks passed' AS result;
ROLLBACK;






