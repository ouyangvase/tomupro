-- Finance reconciliation layer for the existing Workspace, Driver Inbox and Analytics flows.
-- This migration only adds reconciliation records and read/write RPCs. It does not mutate
-- order lifecycle, delivery acceptance, analytics, or the existing cash settlement tables.

create table if not exists public.finance_transfer_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  runner_id uuid references public.profiles(id) on delete restrict,
  order_code text not null,
  record_date date not null,
  amount_bnd numeric(14,2) not null default 0,
  checked boolean not null default false,
  checked_by uuid references public.profiles(id),
  checked_at timestamptz,
  customer_name text not null default '',
  note text not null default '',
  bank text,
  transfer_deposit_date date,
  source text not null default 'accepted_transfer_order',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','VOIDED','SUPERSEDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_transfer_receipts_order_unique unique (order_id)
);

create index if not exists finance_transfer_receipts_date_idx
  on public.finance_transfer_receipts (record_date, status, runner_id);

create table if not exists public.finance_driver_end_jobs (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete restrict,
  runner_id uuid not null references public.profiles(id) on delete restrict,
  job_date date not null,
  accepted_cash_expected numeric(14,2) not null default 0,
  previous_accepted_cash numeric(14,2),
  cash_handed numeric(14,2) not null default 0 check (cash_handed >= 0),
  cdm_amount numeric(14,2) not null default 0 check (cdm_amount >= 0),
  declared_total numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED','NEEDS_UPDATE','LOCKED')),
  note text not null default '',
  needs_update_reason text,
  submitted_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_driver_end_jobs_driver_date_unique unique (driver_id, job_date),
  constraint finance_driver_end_jobs_totals_nonnegative check (declared_total >= 0),
  constraint finance_driver_end_jobs_difference_consistent check (
    difference = round(accepted_cash_expected - declared_total, 2)
  )
);

create index if not exists finance_driver_end_jobs_runner_date_idx
  on public.finance_driver_end_jobs (runner_id, job_date, status);

create table if not exists public.finance_end_job_photos (
  id uuid primary key default gen_random_uuid(),
  end_job_id uuid not null references public.finance_driver_end_jobs(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists finance_end_job_photos_job_idx
  on public.finance_end_job_photos (end_job_id, deleted_at);

create table if not exists public.finance_daily_cash_confirmations (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id) on delete restrict,
  job_date date not null,
  cash_amount_snapshot numeric(14,2) not null default 0,
  received boolean not null default false,
  received_by uuid references public.profiles(id),
  received_at timestamptz,
  needs_reconfirmation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_daily_cash_confirmations_unique unique (runner_id, job_date)
);

create table if not exists public.finance_claim_reconciliations (
  id uuid primary key default gen_random_uuid(),
  runner_id uuid not null references public.profiles(id) on delete restrict,
  batch_total_bnd numeric(14,2) not null default 0,
  out_amount_bnd numeric(14,2) not null default 0 check (out_amount_bnd >= 0),
  gross_amount_bnd numeric(14,2) not null default 0,
  status text not null default 'SAVED' check (status in ('DRAFT','SAVED','VOIDED')),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_claim_reconciliations_gross_consistent check (
    gross_amount_bnd = round(batch_total_bnd - out_amount_bnd, 2)
  )
);

create table if not exists public.finance_claim_reconciliation_batches (
  reconciliation_id uuid not null references public.finance_claim_reconciliations(id) on delete cascade,
  claim_batch_id uuid not null references public.claim_batches(id) on delete restrict,
  batch_code text not null,
  amount_snapshot_bnd numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (reconciliation_id, claim_batch_id),
  constraint finance_claim_reconciliation_batch_unique unique (claim_batch_id)
);

create table if not exists public.finance_reconciliation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_role text,
  action text not null,
  record_type text not null,
  record_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists finance_reconciliation_audit_record_idx
  on public.finance_reconciliation_audit_logs (record_type, record_id, created_at desc);

alter table public.finance_transfer_receipts enable row level security;
alter table public.finance_driver_end_jobs enable row level security;
alter table public.finance_end_job_photos enable row level security;
alter table public.finance_daily_cash_confirmations enable row level security;
alter table public.finance_claim_reconciliations enable row level security;
alter table public.finance_claim_reconciliation_batches enable row level security;
alter table public.finance_reconciliation_audit_logs enable row level security;

grant select, insert, update, delete on
  public.finance_transfer_receipts,
  public.finance_driver_end_jobs,
  public.finance_end_job_photos,
  public.finance_daily_cash_confirmations,
  public.finance_claim_reconciliations,
  public.finance_claim_reconciliation_batches,
  public.finance_reconciliation_audit_logs
to authenticated;

create or replace function private.finance_role()
returns text
language sql stable security invoker set search_path = public, private, pg_temp
as $$ select coalesce(public.get_user_role(auth.uid())::text, '') $$;

create or replace function private.finance_can_manage_runner(p_runner_id uuid)
returns boolean
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select auth.uid() is not null
    and (
      private.finance_role() in ('admin','manager')
      or (private.finance_role() = 'runner' and p_runner_id = auth.uid())
    );
$$;

create or replace function private.finance_can_access_driver(p_driver_id uuid)
returns boolean
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select auth.uid() is not null
    and (
      private.finance_role() in ('admin','manager')
      or (private.finance_role() = 'driver' and p_driver_id = auth.uid())
      or (private.finance_role() = 'runner' and exists (
        select 1 from public.runner_drivers rd
        where rd.runner_id = auth.uid() and rd.driver_id = p_driver_id and rd.is_active
      ))
      or (private.finance_role() = 'runner_assistant' and exists (
        select 1
        from public.runner_drivers rd
        where rd.driver_id = p_driver_id
          and rd.is_active
          and public.has_runner_assistant_permission(auth.uid(), rd.runner_id, 'driver_analytics')
      ))
    );
$$;

create or replace function private.finance_transfer_amount(p_order_id uuid)
returns numeric
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select coalesce(payment.transfer_amount, 0)::numeric
  from public.orders o
  cross join lateral private.driver_analytics_reported_payment_components(
    case
      when upper(coalesce(o.payment_plan::text,'')) = 'TRANSFER'
        or (upper(coalesce(o.payment_method::text,'')) in ('TRANSFER','BANK_TRANSFER')
          and coalesce(o.cod_amount,0) <= 0)
      then greatest(coalesce(private.order_transfer_paid_amount(o.id),0), coalesce(o.total_amount,0))
      else private.order_cod_due_amount(o.id)
    end,
    case when o.payment_plan = 'PARTIAL_TRANSFER_COD' then null else o.payment_method::text end,
    o.driver_payment_method,
    o.driver_cash_amount,
    o.driver_transfer_amount
  ) payment
  where o.id = p_order_id;
$$;

create or replace function private.finance_acceptance_date(p_order_id uuid)
returns date
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select coalesce(
    (select max(a.created_at)::date from public.audit_logs a
      where a.entity_type = 'order' and a.entity_id = p_order_id
        and a.action = 'DRIVER_DELIVERY_ACCEPTED'),
    (select o.runner_reviewed_at::date from public.orders o where o.id = p_order_id),
    (select o.delivered_at::date from public.orders o where o.id = p_order_id),
    (select o.driver_delivered_at::date from public.orders o where o.id = p_order_id),
    (select o.order_date from public.orders o where o.id = p_order_id)
  );
$$;

create or replace function private.finance_transfer_is_eligible(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.driver_status = 'DRIVER_DELIVERED'
      and coalesce(o.runner_accept_status,'') = 'ACCEPTED'
      and coalesce(o.runner_status::text,'') = 'DELIVERED'
      and (upper(coalesce(o.payment_plan,'')) = 'TRANSFER' or upper(coalesce(o.payment_method::text,'')) in ('TRANSFER','BANK_TRANSFER'))
      and coalesce(o.status::text,'') not in ('CANCELLED','CANCELED','RETURNED','REFUNDED')
      and coalesce(o.runner_status::text,'') not in ('CANCELLED','CANCELED','RETURNED','REFUNDED')
      and o.cancelled_at is null
  );
$$;

create or replace function private.finance_sync_transfer_receipt(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then return; end if;
  if private.finance_transfer_is_eligible(p_order_id) then
    insert into public.finance_transfer_receipts (
      order_id, runner_id, order_code, record_date, amount_bnd, customer_name, status
    ) values (
      o.id, o.runner_id, coalesce(o.order_code, o.id::text),
      private.finance_acceptance_date(o.id), private.finance_transfer_amount(o.id),
      coalesce(o.customer_name,''), 'ACTIVE'
    )
    on conflict (order_id) do update set
      runner_id = excluded.runner_id,
      order_code = excluded.order_code,
      record_date = excluded.record_date,
      amount_bnd = excluded.amount_bnd,
      customer_name = excluded.customer_name,
      status = 'ACTIVE',
      updated_at = now();
  else
    update public.finance_transfer_receipts
    set status = 'VOIDED', updated_at = now()
    where order_id = p_order_id and status = 'ACTIVE';
  end if;
end;
$$;

create or replace function public.finance_sync_transfer_receipt_trigger()
returns trigger
language plpgsql security definer set search_path = public, private, pg_temp
as $$
begin
  perform private.finance_sync_transfer_receipt(new.id);
  return new;
end;
$$;

drop trigger if exists trg_finance_transfer_receipt_sync on public.orders;
create trigger trg_finance_transfer_receipt_sync
after insert or update of driver_status, runner_accept_status, runner_status, payment_plan,
  payment_method, driver_payment_method, driver_cash_amount, driver_transfer_amount,
  runner_reviewed_at, delivered_at, driver_delivered_at, cancelled_at, order_code, customer_name, runner_id
on public.orders
for each row execute function public.finance_sync_transfer_receipt_trigger();

create or replace function public.finance_backfill_transfer_receipts(p_dry_run boolean default true)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(public.get_user_role(v_actor)::text, 'service');
  v_found integer;
  v_existing integer;
  v_missing integer;
  v_inserted integer := 0;
begin
  if v_actor is not null and v_role not in ('admin','manager') then
    raise exception 'Only an administrator can backfill finance receipts';
  end if;
  select count(*)::int into v_found from public.orders o where private.finance_transfer_is_eligible(o.id);
  select count(*)::int into v_existing from public.orders o
    join public.finance_transfer_receipts r on r.order_id = o.id and r.status = 'ACTIVE'
    where private.finance_transfer_is_eligible(o.id);
  v_missing := greatest(v_found - v_existing, 0);
  if not p_dry_run then
    insert into public.finance_transfer_receipts (order_id, runner_id, order_code, record_date, amount_bnd, customer_name)
    select o.id, o.runner_id, coalesce(o.order_code,o.id::text), private.finance_acceptance_date(o.id),
      private.finance_transfer_amount(o.id), coalesce(o.customer_name,'')
    from public.orders o
    where private.finance_transfer_is_eligible(o.id)
      and not exists (select 1 from public.finance_transfer_receipts r where r.order_id = o.id)
    on conflict (order_id) do nothing;
    get diagnostics v_inserted = row_count;
  end if;
  return jsonb_build_object(
    'dry_run', p_dry_run,
    'transfer_orders_found', v_found,
    'existing_active_receipts', v_existing,
    'missing_receipts', v_missing,
    'inserted_receipts', v_inserted,
    'duplicate_risk', 0
  );
end;
$$;

create or replace function private.finance_driver_expected_cash(p_driver_id uuid, p_job_date date)
returns numeric
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select coalesce(sum(cash_collected_amount) filter (where accepted_delivery),0)::numeric
  from private.get_driver_analytics_cohort(p_driver_id, p_job_date, p_job_date);
$$;

create or replace function public.get_driver_end_job_context(p_driver_id uuid, p_date date)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_expected numeric := private.finance_driver_expected_cash(p_driver_id, p_date);
  v_pending numeric := 0;
  v_pending_count integer := 0;
  v_job jsonb;
  v_runner uuid;
  v_today date := (now() at time zone 'Asia/Brunei')::date;
begin
  if v_actor is null or not private.finance_can_access_driver(p_driver_id) then
    raise exception 'Driver End Job is not available for this user';
  end if;
  select coalesce(sum(private.order_cod_due_amount(x.order_id)),0), count(*)::int into v_pending, v_pending_count
  from private.get_driver_analytics_cohort(p_driver_id, p_date, p_date) x
  where x.pending_acceptance and x.driver_status = 'DRIVER_DELIVERED'
    and private.order_cod_due_amount(x.order_id) > 0;
  select to_jsonb(j) into v_job from public.finance_driver_end_jobs j
    where j.driver_id = p_driver_id and j.job_date = p_date;
  if v_job is not null and p_date < v_today - 2 then
    v_job := jsonb_set(v_job, '{status}', '"LOCKED"'::jsonb);
  end if;
  select rd.runner_id into v_runner from public.runner_drivers rd
    where rd.driver_id = p_driver_id and rd.is_active order by rd.created_at desc limit 1;
  return jsonb_build_object(
    'driver_id', p_driver_id,
    'date', p_date,
    'accepted_cash', round(v_expected,2),
    'pending_cash', round(v_pending,2),
    'pending_cash_count', v_pending_count,
    'end_job', coalesce(v_job, '{}'::jsonb),
    'editable', p_date between v_today - 2 and v_today and p_date <= v_today,
    'runner_id', v_runner
  );
end;
$$;

create or replace function public.upsert_driver_end_job(
  p_driver_id uuid,
  p_job_date date,
  p_cash_handed numeric,
  p_cdm_amount numeric,
  p_note text default ''
)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(public.get_user_role(v_actor)::text, '');
  v_expected numeric;
  v_total numeric := round(greatest(coalesce(p_cash_handed,0),0) + greatest(coalesce(p_cdm_amount,0),0),2);
  v_difference numeric;
  v_existing public.finance_driver_end_jobs%rowtype;
  v_id uuid;
  v_runner uuid;
  v_today date := (now() at time zone 'Asia/Brunei')::date;
begin
  if v_actor is null or p_driver_id is null or p_job_date is null or p_job_date < v_today - 2 or p_job_date > v_today then
    raise exception 'End Job can only be submitted for the latest 3 Brunei calendar days';
  end if;
  if v_role = 'driver' and v_actor <> p_driver_id then
    raise exception 'A Driver can only submit their own End Job';
  end if;
  if v_role = 'runner' and not exists (select 1 from public.runner_drivers rd where rd.runner_id=v_actor and rd.driver_id=p_driver_id and rd.is_active) then
    raise exception 'Driver is not linked to this Runner';
  end if;
  if v_role = 'runner_assistant' and not private.finance_can_access_driver(p_driver_id) then
    raise exception 'Driver is outside the permitted Runner scope';
  end if;
  if v_role not in ('driver','runner','runner_assistant','admin','manager') then raise exception 'End Job is not available for this user'; end if;
  v_expected := round(private.finance_driver_expected_cash(p_driver_id, p_job_date),2);
  v_difference := round(v_expected - v_total,2);
  if abs(v_difference) > 0.005 then
    raise exception 'Cash handed over plus CDM must equal Accepted Cash. Difference: BND %', to_char(v_difference,'FM999999990.00');
  end if;
  select * into v_existing from public.finance_driver_end_jobs where driver_id=p_driver_id and job_date=p_job_date;
  select rd.runner_id into v_runner from public.runner_drivers rd where rd.driver_id=p_driver_id and rd.is_active order by rd.created_at desc limit 1;
  if v_runner is null and v_existing.runner_id is not null then v_runner := v_existing.runner_id; end if;
  if v_runner is null then raise exception 'Driver is not linked to an active Runner'; end if;
  insert into public.finance_driver_end_jobs (
    id, driver_id, runner_id, job_date, accepted_cash_expected, previous_accepted_cash,
    cash_handed, cdm_amount, declared_total, difference, status, note, needs_update_reason,
    submitted_at, created_by, updated_by
  ) values (
    coalesce(v_existing.id, gen_random_uuid()), p_driver_id, v_runner, p_job_date, v_expected,
    case when v_existing.id is null then null else v_existing.accepted_cash_expected end,
    greatest(coalesce(p_cash_handed,0),0), greatest(coalesce(p_cdm_amount,0),0), v_total, v_difference,
    'SUBMITTED', coalesce(p_note,''), null, now(), v_actor, v_actor
  )
  on conflict (driver_id, job_date) do update set
    runner_id=excluded.runner_id,
    previous_accepted_cash=public.finance_driver_end_jobs.accepted_cash_expected,
    accepted_cash_expected=excluded.accepted_cash_expected,
    cash_handed=excluded.cash_handed,
    cdm_amount=excluded.cdm_amount,
    declared_total=excluded.declared_total,
    difference=excluded.difference,
    status='SUBMITTED', note=excluded.note, needs_update_reason=null,
    submitted_at=now(), updated_by=v_actor, updated_at=now()
  returning id into v_id;
  insert into public.finance_reconciliation_audit_logs(actor_id,actor_role,action,record_type,record_id,before_data,after_data)
  values(v_actor,v_role,'END_JOB_UPSERT','driver_end_job',v_id,
    case when v_existing.id is null then null else to_jsonb(v_existing) end,
    (select to_jsonb(j) from public.finance_driver_end_jobs j where j.id=v_id));
  return public.get_driver_end_job_context(p_driver_id,p_job_date);
end;
$$;

create or replace function public.upsert_daily_cash_confirmation(
  p_runner_id uuid,
  p_job_date date,
  p_received boolean
)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_amount numeric;
  v_id uuid;
begin
  if v_actor is null or not private.finance_can_manage_runner(p_runner_id) then raise exception 'Runner cash confirmation is not permitted'; end if;
  select coalesce(sum(j.cash_handed),0) into v_amount from public.finance_driver_end_jobs j where j.runner_id=p_runner_id and j.job_date=p_job_date and j.status <> 'LOCKED';
  insert into public.finance_daily_cash_confirmations(runner_id,job_date,cash_amount_snapshot,received,received_by,received_at,needs_reconfirmation)
  values(p_runner_id,p_job_date,round(v_amount,2),coalesce(p_received,false),v_actor,case when p_received then now() else null end,false)
  on conflict (runner_id,job_date) do update set
    cash_amount_snapshot=excluded.cash_amount_snapshot,received=excluded.received,
    received_by=case when excluded.received then excluded.received_by else null end,
    received_at=case when excluded.received then excluded.received_at else null end,
    needs_reconfirmation=false,updated_at=now()
  returning id into v_id;
  insert into public.finance_reconciliation_audit_logs(actor_id,actor_role,action,record_type,record_id,after_data)
  values(v_actor,private.finance_role(),'DAILY_CASH_CONFIRMATION','daily_cash_confirmation',v_id,(select to_jsonb(c) from public.finance_daily_cash_confirmations c where c.id=v_id));
  return (select to_jsonb(c) from public.finance_daily_cash_confirmations c where c.id=v_id);
end;
$$;

create or replace function public.save_finance_receipt(
  p_receipt_id uuid,
  p_checked boolean,
  p_note text,
  p_bank text,
  p_transfer_deposit_date date
)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_runner uuid;
begin
  select to_jsonb(r),r.runner_id into v_before,v_runner from public.finance_transfer_receipts r where r.id=p_receipt_id;
  if v_before is null or not private.finance_can_manage_runner(v_runner) then raise exception 'Transfer receipt is not accessible'; end if;
  update public.finance_transfer_receipts r set
    checked=coalesce(p_checked,false), checked_by=case when coalesce(p_checked,false) then v_actor else null end,
    checked_at=case when coalesce(p_checked,false) then now() else null end,
    note=coalesce(p_note,''),bank=nullif(trim(coalesce(p_bank,'')),''),transfer_deposit_date=p_transfer_deposit_date,updated_at=now()
  where r.id=p_receipt_id and r.status='ACTIVE' returning to_jsonb(r) into v_after;
  insert into public.finance_reconciliation_audit_logs(actor_id,actor_role,action,record_type,record_id,before_data,after_data)
  values(v_actor,private.finance_role(),'RECEIPT_UPDATE','transfer_receipt',p_receipt_id,v_before,v_after);
  return v_after;
end;
$$;

create or replace function public.save_claim_reconciliation(
  p_reconciliation_id uuid,
  p_runner_id uuid,
  p_claim_batch_ids uuid[],
  p_out_amount numeric
)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := private.finance_role();
  v_total numeric;
  v_id uuid := coalesce(p_reconciliation_id,gen_random_uuid());
  v_before jsonb;
begin
  if v_actor is null or not private.finance_can_manage_runner(p_runner_id) then raise exception 'Claim reconciliation is not permitted'; end if;
  if coalesce(cardinality(p_claim_batch_ids),0)=0 then raise exception 'Select at least one claim batch'; end if;
  if exists (
    select 1 from public.finance_claim_reconciliation_batches x
    join public.finance_claim_reconciliations r on r.id=x.reconciliation_id
    where x.claim_batch_id=any(p_claim_batch_ids) and x.reconciliation_id<>v_id and r.status<>'VOIDED'
  ) then raise exception 'One or more claim batches are already reconciled'; end if;
  if exists (
    select 1 from public.claim_batches cb where cb.id=any(p_claim_batch_ids) and cb.runner_id<>p_runner_id
  ) then raise exception 'Claim batches are outside the permitted Runner scope'; end if;
  select coalesce(sum(coalesce(cb.total_bnd,cb.total_amount)),0) into v_total from public.claim_batches cb where cb.id=any(p_claim_batch_ids) and cb.runner_id=p_runner_id;
  if v_total<=0 then raise exception 'Selected claim batches have no BND total'; end if;
  if coalesce(p_out_amount,0)<0 or coalesce(p_out_amount,0)>v_total then raise exception 'OUT must be between BND 0.00 and the selected batch total'; end if;
  select to_jsonb(r) into v_before from public.finance_claim_reconciliations r where r.id=v_id;
  insert into public.finance_claim_reconciliations(id,runner_id,batch_total_bnd,out_amount_bnd,gross_amount_bnd,status,created_by,updated_by)
  values(v_id,p_runner_id,round(v_total,2),round(coalesce(p_out_amount,0),2),round(v_total-coalesce(p_out_amount,0),2),'SAVED',v_actor,v_actor)
  on conflict (id) do update set
    runner_id=excluded.runner_id,batch_total_bnd=excluded.batch_total_bnd,out_amount_bnd=excluded.out_amount_bnd,
    gross_amount_bnd=excluded.gross_amount_bnd,status='SAVED',updated_by=v_actor,updated_at=now();
  delete from public.finance_claim_reconciliation_batches where reconciliation_id=v_id;
  insert into public.finance_claim_reconciliation_batches(reconciliation_id,claim_batch_id,batch_code,amount_snapshot_bnd)
  select v_id,cb.id,cb.batch_code,coalesce(cb.total_bnd,cb.total_amount) from public.claim_batches cb where cb.id=any(p_claim_batch_ids) and cb.runner_id=p_runner_id;
  insert into public.finance_reconciliation_audit_logs(actor_id,actor_role,action,record_type,record_id,before_data,after_data)
  values(v_actor,v_role,'CLAIM_RECONCILIATION_SAVE','claim_reconciliation',v_id,v_before,(select to_jsonb(r) from public.finance_claim_reconciliations r where r.id=v_id));
  return (select jsonb_build_object('reconciliation',to_jsonb(r),'batches',coalesce((select jsonb_agg(to_jsonb(b)) from public.finance_claim_reconciliation_batches b where b.reconciliation_id=v_id),'[]'::jsonb)) from public.finance_claim_reconciliations r where r.id=v_id);
end;
$$;

create or replace function public.get_finance_reconciliation_workspace(
  p_date_from date default null,
  p_date_to date default null,
  p_runner_id uuid default null,
  p_driver_id uuid default null,
  p_type text default null,
  p_checked text default null,
  p_bank text default null,
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := private.finance_role();
  v_from date := coalesce(p_date_from,(now() at time zone 'Asia/Brunei')::date);
  v_to date := coalesce(p_date_to,v_from);
  v_runner uuid := p_runner_id;
  v_result jsonb;
begin
  if v_actor is null or v_role not in ('admin','manager','runner') then raise exception 'Finance Workspace access is not permitted'; end if;
  if v_role='runner' then v_runner:=v_actor; elsif v_runner is not null and not private.finance_can_manage_runner(v_runner) then raise exception 'Runner scope is not permitted'; end if;
  if v_to<v_from then raise exception 'Invalid finance date range'; end if;
  with driver_scope as materialized (
    select distinct rd.driver_id,rd.runner_id
    from public.runner_drivers rd
    where rd.is_active and (v_runner is null or rd.runner_id=v_runner) and (p_driver_id is null or rd.driver_id=p_driver_id)
  ),
  calendar as (
    select gs::date job_date from generate_series(v_from,v_to,interval '1 day') gs
  ),
  expected as (
    select c.job_date,coalesce(sum(private.finance_driver_expected_cash(ds.driver_id,c.job_date)),0)::numeric expected_cash,
      count(ds.driver_id)::int expected_driver_count
    from calendar c cross join driver_scope ds group by c.job_date
  ),
  jobs as (
    select j.job_date,sum(j.accepted_cash_expected)::numeric accepted_cash,sum(j.cash_handed)::numeric cash_handed,
      sum(j.cdm_amount)::numeric cdm_amount,count(*)::int submitted_job_count,
      bool_or(j.status='NEEDS_UPDATE' or abs(j.difference)>0.005) needs_update
    from public.finance_driver_end_jobs j join driver_scope ds on ds.driver_id=j.driver_id and ds.runner_id=j.runner_id
    where j.job_date between v_from and v_to group by j.job_date
  ),
  confirmations as (
    select c.job_date,bool_and(c.received) received,bool_or(c.needs_reconfirmation) needs_reconfirmation,sum(c.cash_amount_snapshot) cash_amount_snapshot
    from public.finance_daily_cash_confirmations c where (v_runner is null or c.runner_id=v_runner) and c.job_date between v_from and v_to group by c.job_date
  ),
  receipt_summary as (
    select r.record_date,
      coalesce(sum(r.amount_bnd),0)::numeric transfer_total,
      coalesce(sum(r.amount_bnd) filter(where r.checked),0)::numeric checked_transfer,
      coalesce(sum(r.amount_bnd) filter(where not r.checked),0)::numeric unchecked_transfer,
      count(*) filter(where not r.checked)::int unchecked_count
    from public.finance_transfer_receipts r left join driver_scope ds on ds.runner_id=r.runner_id
    where r.status='ACTIVE' and r.record_date between v_from and v_to and (v_runner is null or ds.runner_id is not null)
    group by r.record_date
  ),
  daily as (
    select e.job_date,
      round(e.expected_cash,2) expected_cash,
      round(coalesce(j.accepted_cash,0),2) accepted_cash,
      round(coalesce(j.cash_handed,0),2) cash_handed,
      round(coalesce(j.cdm_amount,0),2) cdm_amount,
      round(coalesce(r.transfer_total,0),2) transfer_total,
      round(coalesce(r.checked_transfer,0),2) checked_transfer,
      round(coalesce(r.unchecked_transfer,0),2) unchecked_transfer,
      coalesce(r.unchecked_count,0) unchecked_count,
      coalesce(e.expected_driver_count,0) expected_driver_count,
      coalesce(j.submitted_job_count,0) submitted_job_count,
      round(coalesce(j.accepted_cash,0),2) submitted_cod,
      round(coalesce(j.cash_handed,0)+coalesce(r.checked_transfer,0),2) total_collection,
      coalesce(c.received,false) physical_cash_received,
      coalesce(c.needs_reconfirmation,false) needs_reconfirmation,
      coalesce((select jsonb_agg(jsonb_build_object(
        'driver_id',dj.driver_id,
        'driver_name',coalesce(dp.display_name,dp.email,'Driver'),
        'accepted_cash',round(dj.accepted_cash_expected,2),
        'cash_handed',round(dj.cash_handed,2),
        'cdm_amount',round(dj.cdm_amount,2),
        'difference',round(dj.difference,2),
        'status',dj.status
      ) order by dp.display_name)
      from public.finance_driver_end_jobs dj
      join driver_scope dds on dds.driver_id=dj.driver_id and dds.runner_id=dj.runner_id
      left join public.profiles dp on dp.id=dj.driver_id
      where dj.job_date=e.job_date),'[]'::jsonb) drivers,
      case when coalesce(j.needs_update,false) or coalesce(r.unchecked_count,0)>0 or coalesce(c.needs_reconfirmation,false)
          or coalesce(j.submitted_job_count,0)<coalesce(e.expected_driver_count,0)
          or round(coalesce(j.accepted_cash,0),2)<>round(coalesce(j.cash_handed,0)+coalesce(j.cdm_amount,0),2)
        then 'CHECK' else 'OK' end status
    from expected e left join jobs j on j.job_date=e.job_date left join receipt_summary r on r.record_date=e.job_date left join confirmations c on c.job_date=e.job_date
  ),
  records as (
    select r.id,r.record_date as date,'RECEIPT'::text as type,r.order_code as reference,r.amount_bnd,r.checked,
      r.customer_name as name,r.note,r.bank,r.transfer_deposit_date,r.source,r.status,null::numeric cash_handed,null::numeric cdm_amount
    from public.finance_transfer_receipts r left join driver_scope ds on ds.runner_id=r.runner_id
    where r.status='ACTIVE' and r.record_date between v_from and v_to and (v_runner is null or ds.runner_id is not null)
      and (p_type is null or upper(p_type) in ('ALL','RECEIPT'))
      and (p_checked is null or upper(p_checked)='ALL' or (upper(p_checked)='CHECKED' and r.checked) or (upper(p_checked)='UNCHECKED' and not r.checked))
      and (p_bank is null or p_bank='' or coalesce(r.bank,'')=p_bank)
      and (p_search is null or p_search='' or r.order_code ilike '%'||p_search||'%' or r.customer_name ilike '%'||p_search||'%')
    union all
    select j.id,j.job_date,'COD'::text,coalesce(dp.display_name,'Driver'),round(j.accepted_cash_expected,2),coalesce(c.received,false),
      coalesce(dp.display_name,'Driver'),j.note,'CASH',j.job_date,'driver_end_job',j.status,j.cash_handed,j.cdm_amount
    from public.finance_driver_end_jobs j join driver_scope ds on ds.driver_id=j.driver_id and ds.runner_id=j.runner_id
    left join public.profiles dp on dp.id=j.driver_id left join public.finance_daily_cash_confirmations c on c.runner_id=j.runner_id and c.job_date=j.job_date
    where j.job_date between v_from and v_to and (p_type is null or upper(p_type) in ('ALL','COD'))
      and (p_checked is null or upper(p_checked)='ALL' or (upper(p_checked)='CHECKED' and coalesce(c.received,false)) or (upper(p_checked)='UNCHECKED' and not coalesce(c.received,false)))
      and (p_search is null or p_search='' or dp.display_name ilike '%'||p_search||'%')
  ),
  record_page as (select * from records order by date desc,type,reference limit greatest(1,least(coalesce(p_limit,100),500)) offset greatest(coalesce(p_offset,0),0)),
  claims as (
    select cb.id,cb.batch_code,coalesce(cb.total_bnd,cb.total_amount)::numeric total_bnd,cb.runner_id,cb.submitted_at
    from public.claim_batches cb
    where (v_runner is null or cb.runner_id=v_runner)
      and not exists(select 1 from public.finance_claim_reconciliation_batches x join public.finance_claim_reconciliations cr on cr.id=x.reconciliation_id where x.claim_batch_id=cb.id and cr.status<>'VOIDED')
  )
  select jsonb_build_object(
    'filters',jsonb_build_object('date_from',v_from,'date_to',v_to,'runner_id',v_runner),
    'summary',jsonb_build_object(
      'expected_cash',coalesce((select sum(expected_cash) from daily),0),
      'submitted_cod',coalesce((select sum(submitted_cod) from daily),0),
      'cash_handed',coalesce((select sum(cash_handed) from daily),0),
      'cdm_total',coalesce((select sum(cdm_amount) from daily),0),
      'transfer_total',coalesce((select sum(transfer_total) from daily),0),
      'checked_transfer',coalesce((select sum(checked_transfer) from daily),0),
      'unchecked_transfer',coalesce((select sum(unchecked_transfer) from daily),0),
      'unchecked_count',coalesce((select sum(unchecked_count) from daily),0),
      'total_collection',coalesce((select sum(total_collection) from daily),0)
    ),
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.job_date desc) from daily d),'[]'::jsonb),
    'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.date desc,r.type,r.reference) from record_page r),'[]'::jsonb),
    'claims',coalesce((select jsonb_agg(to_jsonb(c) order by c.submitted_at desc) from claims c),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.finance_end_job_order_trigger()
returns trigger
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_date date;
  v_new numeric;
  v_old numeric;
  j public.finance_driver_end_jobs%rowtype;
begin
  if new.driver_id is null then return new; end if;
  v_date := private.finance_acceptance_date(new.id);
  select * into j from public.finance_driver_end_jobs where driver_id=new.driver_id and job_date=v_date;
  if not found or j.status='LOCKED' then return new; end if;
  v_new := round(private.finance_driver_expected_cash(new.driver_id,v_date),2);
  v_old := round(j.accepted_cash_expected,2);
  if v_new <> v_old then
    update public.finance_driver_end_jobs set
      previous_accepted_cash=v_old,
      accepted_cash_expected=v_new,
      difference=round(v_new-declared_total,2),
      status='NEEDS_UPDATE',
      needs_update_reason=format('Accepted Cash changed from BND %s to BND %s',to_char(v_old,'FM999999990.00'),to_char(v_new,'FM999999990.00')),
      updated_at=now()
    where id=j.id;
    update public.finance_daily_cash_confirmations set needs_reconfirmation=true,updated_at=now()
      where runner_id=j.runner_id and job_date=v_date and received;
    if not exists(select 1 from public.notifications n where n.user_id=new.driver_id and n.reference_id=j.id and n.type='finance_end_job_needs_update' and n.created_at > now()-interval '1 day') then
      insert into public.notifications(user_id,title,message,type,is_read,reference_type,reference_id,recipient_role,body,priority,entity_type)
      values(new.driver_id,'End Job needs update',format('Accepted Cash changed to BND %s. Please update your End Job for %s.',to_char(v_new,'FM999999990.00'),v_date),'finance_end_job_needs_update',false,'finance_end_job',j.id,'driver',format('Accepted Cash changed from BND %s to BND %s.',to_char(v_old,'FM999999990.00'),to_char(v_new,'FM999999990.00')),'high','finance_end_job');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_finance_end_job_order_update on public.orders;
create trigger trg_finance_end_job_order_update
after update of driver_status,runner_accept_status,runner_status,driver_id,driver_delivered_at,runner_reviewed_at,delivered_at
on public.orders for each row execute function public.finance_end_job_order_trigger();

drop policy if exists finance_receipts_select on public.finance_transfer_receipts;
create policy finance_receipts_select on public.finance_transfer_receipts for select to authenticated
using (private.finance_role() in ('admin','manager') or (private.finance_role()='runner' and runner_id=auth.uid()));
drop policy if exists finance_receipts_update on public.finance_transfer_receipts;
create policy finance_receipts_update on public.finance_transfer_receipts for update to authenticated
using (private.finance_role() in ('admin','manager') or (private.finance_role()='runner' and runner_id=auth.uid()) )
with check (private.finance_role() in ('admin','manager') or (private.finance_role()='runner' and runner_id=auth.uid()));

drop policy if exists finance_end_jobs_select on public.finance_driver_end_jobs;
create policy finance_end_jobs_select on public.finance_driver_end_jobs for select to authenticated
using (private.finance_can_access_driver(driver_id));
drop policy if exists finance_end_jobs_write on public.finance_driver_end_jobs;
create policy finance_end_jobs_write on public.finance_driver_end_jobs for all to authenticated
using (private.finance_can_access_driver(driver_id)) with check (private.finance_can_access_driver(driver_id));
drop policy if exists finance_end_job_photos_select on public.finance_end_job_photos;
create policy finance_end_job_photos_select on public.finance_end_job_photos for select to authenticated
using (exists(select 1 from public.finance_driver_end_jobs j where j.id=end_job_id and private.finance_can_access_driver(j.driver_id)));
drop policy if exists finance_end_job_photos_write on public.finance_end_job_photos;
create policy finance_end_job_photos_write on public.finance_end_job_photos for all to authenticated
using (exists(select 1 from public.finance_driver_end_jobs j where j.id=end_job_id and private.finance_can_access_driver(j.driver_id)))
with check (exists(select 1 from public.finance_driver_end_jobs j where j.id=end_job_id and private.finance_can_access_driver(j.driver_id)));

drop policy if exists finance_daily_cash_select on public.finance_daily_cash_confirmations;
create policy finance_daily_cash_select on public.finance_daily_cash_confirmations for select to authenticated
using (private.finance_can_manage_runner(runner_id));
drop policy if exists finance_daily_cash_write on public.finance_daily_cash_confirmations;
create policy finance_daily_cash_write on public.finance_daily_cash_confirmations for all to authenticated
using (private.finance_can_manage_runner(runner_id)) with check (private.finance_can_manage_runner(runner_id));

drop policy if exists finance_claim_recon_select on public.finance_claim_reconciliations;
create policy finance_claim_recon_select on public.finance_claim_reconciliations for select to authenticated
using (private.finance_can_manage_runner(runner_id));
drop policy if exists finance_claim_recon_write on public.finance_claim_reconciliations;
create policy finance_claim_recon_write on public.finance_claim_reconciliations for all to authenticated
using (private.finance_can_manage_runner(runner_id)) with check (private.finance_can_manage_runner(runner_id));
drop policy if exists finance_claim_recon_batches_select on public.finance_claim_reconciliation_batches;
create policy finance_claim_recon_batches_select on public.finance_claim_reconciliation_batches for select to authenticated
using (exists(select 1 from public.finance_claim_reconciliations r where r.id=reconciliation_id and private.finance_can_manage_runner(r.runner_id)));
drop policy if exists finance_claim_recon_batches_write on public.finance_claim_reconciliation_batches;
create policy finance_claim_recon_batches_write on public.finance_claim_reconciliation_batches for all to authenticated
using (exists(select 1 from public.finance_claim_reconciliations r where r.id=reconciliation_id and private.finance_can_manage_runner(r.runner_id)))
with check (exists(select 1 from public.finance_claim_reconciliations r where r.id=reconciliation_id and private.finance_can_manage_runner(r.runner_id)));

drop policy if exists finance_recon_audit_select on public.finance_reconciliation_audit_logs;
create policy finance_recon_audit_select on public.finance_reconciliation_audit_logs for select to authenticated
using (private.finance_role() in ('admin','manager') or actor_id=auth.uid());

insert into storage.buckets(id,name,public)
values ('finance-end-job-photos','finance-end-job-photos',false)
on conflict (id) do update set public=false;

drop policy if exists finance_end_job_photo_select on storage.objects;
create policy finance_end_job_photo_select on storage.objects for select to authenticated
using (bucket_id='finance-end-job-photos' and (
  private.finance_role() in ('admin','manager')
  or split_part(name,'/',1)=auth.uid()::text
  or exists(select 1 from public.runner_drivers rd where rd.runner_id=auth.uid() and rd.driver_id=split_part(name,'/',1)::uuid and rd.is_active)
));
drop policy if exists finance_end_job_photo_insert on storage.objects;
create policy finance_end_job_photo_insert on storage.objects for insert to authenticated
with check (bucket_id='finance-end-job-photos' and (
  private.finance_role() in ('admin','manager')
  or split_part(name,'/',1)=auth.uid()::text
  or exists(select 1 from public.runner_drivers rd where rd.runner_id=auth.uid() and rd.driver_id=split_part(name,'/',1)::uuid and rd.is_active)
));
drop policy if exists finance_end_job_photo_delete on storage.objects;
create policy finance_end_job_photo_delete on storage.objects for delete to authenticated
using (bucket_id='finance-end-job-photos' and (
  private.finance_role() in ('admin','manager')
  or split_part(name,'/',1)=auth.uid()::text
  or exists(select 1 from public.runner_drivers rd where rd.runner_id=auth.uid() and rd.driver_id=split_part(name,'/',1)::uuid and rd.is_active)
));

grant execute on function public.finance_backfill_transfer_receipts(boolean),
  public.get_driver_end_job_context(uuid,date), public.upsert_driver_end_job(uuid,date,numeric,numeric,text),
  public.upsert_daily_cash_confirmation(uuid,date,boolean), public.save_finance_receipt(uuid,boolean,text,text,date),
  public.save_claim_reconciliation(uuid,uuid,uuid[],numeric), public.get_finance_reconciliation_workspace(date,date,uuid,uuid,text,text,text,text,integer,integer)
to authenticated;

revoke execute on function public.finance_backfill_transfer_receipts(boolean),
  public.get_driver_end_job_context(uuid,date), public.upsert_driver_end_job(uuid,date,numeric,numeric,text),
  public.upsert_daily_cash_confirmation(uuid,date,boolean), public.save_finance_receipt(uuid,boolean,text,text,date),
  public.save_claim_reconciliation(uuid,uuid,uuid[],numeric), public.get_finance_reconciliation_workspace(date,date,uuid,uuid,text,text,text,text,integer,integer),
  public.finance_sync_transfer_receipt_trigger(), public.finance_end_job_order_trigger()
from public, anon;
grant execute on function public.finance_backfill_transfer_receipts(boolean),
  public.get_driver_end_job_context(uuid,date), public.upsert_driver_end_job(uuid,date,numeric,numeric,text),
  public.upsert_daily_cash_confirmation(uuid,date,boolean), public.save_finance_receipt(uuid,boolean,text,text,date),
  public.save_claim_reconciliation(uuid,uuid,uuid[],numeric), public.get_finance_reconciliation_workspace(date,date,uuid,uuid,text,text,text,text,integer,integer)
to authenticated;
