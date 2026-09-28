-- Disposable database only. Run immediately BEFORE the partial-payment migration.
INSERT INTO auth.users(id,email) VALUES('20000000-0000-4000-8000-000000000001','legacy-payment@test.invalid');
UPDATE public.profiles SET role='admin' WHERE id='20000000-0000-4000-8000-000000000001';
INSERT INTO public.orders(id,order_code,customer_name,phone,address,salesperson_id,order_owner_id,total_amount,total_qty,
  payment_method,receipt_status,receipt_url,runner_status,delivered_at,driver_cash_amount)
SELECT ('20000000-0000-4000-8000-00000000000' || n)::uuid,'PP-LEGACY-'||n,'Legacy payment','1234567','Test',
  '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',72,1,
  CASE WHEN n=3 THEN 'TRANSFER'::public.payment_method ELSE 'COD'::public.payment_method END,
  CASE WHEN n=3 THEN 'confirmed' END, CASE WHEN n=3 THEN 'https://example.test/legacy.jpg' END,
  CASE WHEN n IN (2,4) THEN 'DELIVERED'::public.runner_status ELSE 'UNASSIGNED'::public.runner_status END,
  CASE WHEN n IN (2,4) THEN now() END, CASE WHEN n=4 THEN 72 ELSE 0 END
FROM generate_series(1,4) AS n;
