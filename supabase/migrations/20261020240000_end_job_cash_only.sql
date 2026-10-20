-- End Job must reconcile physical cash only. Transfer collections are tracked
-- separately in Driver Analytics and must never increase the cash declaration.

create or replace function private.finance_driver_end_job_expected_cash(p_driver_id uuid, p_job_date date)
returns numeric
language sql stable security definer set search_path = public, private, pg_temp
as $$
  select coalesce(sum(greatest(coalesce(cohort.cash_pending_amount, 0), 0)), 0)::numeric
  from private.get_driver_analytics_cohort(p_driver_id, p_job_date, p_job_date) cohort
  where cohort.pending_acceptance
    and cohort.driver_status = 'DRIVER_DELIVERED'
    and coalesce(cohort.cash_pending_amount, 0) > 0;
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
    and coalesce(cohort.cash_pending_amount, 0) > 0;
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
    'expected_cash', round(v_expected,2),
    'pending_review_cash', round(v_expected,2),
    'pending_cash', round(v_expected,2),
    'pending_cash_count', v_pending_count,
    'cash_basis', 'PENDING_RUNNER_REVIEW_CASH_ONLY',
    'end_job', coalesce(v_job, '{}'::jsonb),
    'editable', p_date between v_today - 2 and v_today and p_date <= v_today,
    'runner_id', v_runner
  );
end;
$$;

revoke execute on function public.get_driver_end_job_context(uuid,date) from public, anon;
grant execute on function public.get_driver_end_job_context(uuid,date) to authenticated;

notify pgrst, 'reload schema';
