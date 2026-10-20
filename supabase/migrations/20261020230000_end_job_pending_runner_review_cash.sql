-- End Job reconciles the cash that is still awaiting Runner review.
-- Keep finance_driver_expected_cash unchanged because it is also used by the
-- Finance Workspace's accepted-delivery reporting.

create or replace function private.finance_driver_end_job_expected_cash(p_driver_id uuid, p_job_date date)
returns numeric
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select coalesce(sum(cod_due), 0)::numeric
  from (
    select private.order_cod_due_amount(cohort.order_id) as cod_due
    from private.get_driver_analytics_cohort(p_driver_id, p_job_date, p_job_date) cohort
    where cohort.pending_acceptance
      and cohort.driver_status = 'DRIVER_DELIVERED'
  ) pending
  where pending.cod_due > 0;
$$;

revoke all on function private.finance_driver_end_job_expected_cash(uuid, date) from public;

create or replace function public.get_driver_end_job_context(p_driver_id uuid, p_date date)
returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_expected numeric := private.finance_driver_end_job_expected_cash(p_driver_id, p_date);
  v_pending_count integer := 0;
  v_job jsonb;
  v_runner uuid;
  v_today date := (now() at time zone 'Asia/Brunei')::date;
begin
  if v_actor is null or not private.finance_can_access_driver(p_driver_id) then
    raise exception 'Driver End Job is not available for this user';
  end if;
  select count(*)::int into v_pending_count
  from private.get_driver_analytics_cohort(p_driver_id, p_date, p_date) cohort
  where cohort.pending_acceptance
    and cohort.driver_status = 'DRIVER_DELIVERED'
    and private.order_cod_due_amount(cohort.order_id) > 0;
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
    -- Keep accepted_cash for existing clients; it now represents the new
    -- pending-review cash basis until all clients use expected_cash.
    'accepted_cash', round(v_expected,2),
    'expected_cash', round(v_expected,2),
    'pending_review_cash', round(v_expected,2),
    'pending_cash', round(v_expected,2),
    'pending_cash_count', v_pending_count,
    'cash_basis', 'PENDING_RUNNER_REVIEW',
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
  v_expected := round(private.finance_driver_end_job_expected_cash(p_driver_id, p_job_date),2);
  v_difference := round(v_expected - v_total,2);
  if abs(v_difference) > 0.005 then
    raise exception 'Cash handed over plus CDM must equal Pending Runner Review Cash. Difference: BND %', to_char(v_difference,'FM999999990.00');
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
  v_new := round(private.finance_driver_end_job_expected_cash(new.driver_id,v_date),2);
  v_old := round(j.accepted_cash_expected,2);
  if v_new <> v_old then
    update public.finance_driver_end_jobs set
      previous_accepted_cash=v_old,
      accepted_cash_expected=v_new,
      difference=round(v_new-declared_total,2),
      status='NEEDS_UPDATE',
      needs_update_reason=format('Pending Runner Review Cash changed from BND %s to BND %s',to_char(v_old,'FM999999990.00'),to_char(v_new,'FM999999990.00')),
      updated_at=now()
    where id=j.id;
    update public.finance_daily_cash_confirmations set needs_reconfirmation=true,updated_at=now()
      where runner_id=j.runner_id and job_date=v_date and received;
    if not exists(select 1 from public.notifications n where n.user_id=new.driver_id and n.reference_id=j.id and n.type='finance_end_job_needs_update' and n.created_at > now()-interval '1 day') then
      insert into public.notifications(user_id,title,message,type,is_read,reference_type,reference_id,recipient_role,body,priority,entity_type)
      values(new.driver_id,'End Job needs update',format('Pending Runner Review Cash changed to BND %s. Please update your End Job for %s.',to_char(v_new,'FM999999990.00'),v_date),'finance_end_job_needs_update',false,'finance_end_job',j.id,'driver',format('Pending Runner Review Cash changed from BND %s to BND %s.',to_char(v_old,'FM999999990.00'),to_char(v_new,'FM999999990.00')),'high','finance_end_job');
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.get_driver_end_job_context(uuid,date) from public, anon;
grant execute on function public.get_driver_end_job_context(uuid,date) to authenticated;
revoke execute on function public.upsert_driver_end_job(uuid,date,numeric,numeric,text) from public, anon;
grant execute on function public.upsert_driver_end_job(uuid,date,numeric,numeric,text) to authenticated;
