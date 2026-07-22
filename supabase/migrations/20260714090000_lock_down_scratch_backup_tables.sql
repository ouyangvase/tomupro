-- Lock down one-off public backup/fix/audit tables so Supabase Advisor no longer
-- reports them as public tables without RLS. These tables are not application
-- surfaces, so no anon/authenticated policy is added.
do $$
declare
  target_table text;
  locked_count integer := 0;
begin
  for target_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
      and (
        c.relname like '\_backup\_%' escape '\'
        or c.relname like '\_temp\_%' escape '\'
        or c.relname like '%\_backup\_%' escape '\'
        or c.relname like '%\_backup' escape '\'
        or c.relname like '%\_audit\_20%' escape '\'
        or c.relname like '%\_fix\_result\_%' escape '\'
        or c.relname like '%\_fix\_restore\_%' escape '\'
        or c.relname like 'orders_total_amount_fix\_%' escape '\'
        or c.relname like 'order_items_total_amount_fix\_%' escape '\'
        or c.relname like 'claims_total_amount_fix\_%' escape '\'
        or c.relname like 'claim_batch_items_total_amount_fix\_%' escape '\'
        or c.relname like 'claim_batches_total_amount_fix\_%' escape '\'
        or c.relname like 'price_fix\_%' escape '\'
        or c.relname like 'price_total_fix\_%' escape '\'
      )
  loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('revoke all on table public.%I from anon, authenticated', target_table);
    locked_count := locked_count + 1;
  end loop;

  raise notice 'Locked down % public scratch backup/fix/audit tables', locked_count;
end $$;
