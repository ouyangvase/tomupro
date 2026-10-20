-- Finance only reviews End Job receipt photos. Delivery proof photos remain
-- available in order workflows, but are not part of Finance reconciliation.

drop function if exists public.get_finance_driver_proof_photos(date, date, uuid, uuid);

notify pgrst, 'reload schema';
