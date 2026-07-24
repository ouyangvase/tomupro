alter table public.orders
  add column if not exists driver_cash_amount numeric(12, 2),
  add column if not exists driver_transfer_amount numeric(12, 2);
