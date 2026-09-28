-- Run after migration, paired with partial_payment_legacy_setup.sql.
DO $$
BEGIN
  IF private.order_cod_due_amount('20000000-0000-4000-8000-000000000001') <> 72 THEN RAISE EXCEPTION 'Legacy open COD changed'; END IF;
  IF private.order_cod_due_amount('20000000-0000-4000-8000-000000000002') <> 0 THEN RAISE EXCEPTION 'Closed legacy order became collectible'; END IF;
  IF NOT (SELECT payment_history_unverified FROM public.orders WHERE order_code='PP-LEGACY-2') THEN RAISE EXCEPTION 'Unknown history not flagged'; END IF;
  IF private.order_transfer_paid_amount('20000000-0000-4000-8000-000000000003') <> 72 THEN RAISE EXCEPTION 'Confirmed legacy transfer not preserved'; END IF;
  IF (SELECT count(*) FROM public.order_payments WHERE order_id='20000000-0000-4000-8000-000000000003') <> 1 THEN RAISE EXCEPTION 'Duplicate legacy transfer'; END IF;
  IF (SELECT payment_history_unverified OR driver_cash_amount <> 72 FROM public.orders WHERE order_code='PP-LEGACY-4') THEN RAISE EXCEPTION 'Recorded legacy cash changed'; END IF;
END;
$$;
