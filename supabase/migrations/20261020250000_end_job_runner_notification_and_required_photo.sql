-- End Job submission is only complete when at least one receipt photo is
-- already attached to the submitted record. Notify the active Runner after
-- the same transaction succeeds so the Runner sees the Driver's update.

create or replace function public.upsert_driver_end_job_with_photos(
  p_driver_id uuid,
  p_job_date date,
  p_cash_handed numeric,
  p_cdm_amount numeric,
  p_note text default '',
  p_photo_paths text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(public.get_user_role(v_actor)::text, '');
  v_expected numeric;
  v_cash_handed numeric := greatest(coalesce(p_cash_handed, 0), 0);
  v_cdm_amount numeric := greatest(coalesce(p_cdm_amount, 0), 0);
  v_total numeric := round(v_cash_handed + v_cdm_amount, 2);
  v_difference numeric;
  v_existing public.finance_driver_end_jobs%rowtype;
  v_id uuid;
  v_runner uuid;
  v_driver_name text;
  v_previous_status text;
  v_photo_count integer := coalesce(array_length(p_photo_paths, 1), 0);
  v_photo_path text;
begin
  if v_actor is null or p_driver_id is null or p_job_date is null
     or p_job_date < (now() at time zone 'Asia/Brunei')::date - 2
     or p_job_date > (now() at time zone 'Asia/Brunei')::date then
    raise exception 'End Job can only be submitted for the latest 3 Brunei calendar days';
  end if;
  if v_role = 'driver' and v_actor <> p_driver_id then
    raise exception 'A Driver can only submit their own End Job';
  end if;
  if v_role = 'runner' and not exists (
    select 1 from public.runner_drivers rd
    where rd.runner_id = v_actor and rd.driver_id = p_driver_id and rd.is_active
  ) then
    raise exception 'Driver is not linked to this Runner';
  end if;
  if v_role = 'runner_assistant' and not private.finance_can_access_driver(p_driver_id) then
    raise exception 'Driver is outside the permitted Runner scope';
  end if;
  if v_role not in ('driver', 'runner', 'runner_assistant', 'admin', 'manager') then
    raise exception 'End Job is not available for this user';
  end if;

  v_expected := round(private.finance_driver_end_job_expected_cash(p_driver_id, p_job_date), 2);
  v_difference := round(v_expected - v_total, 2);
  if abs(v_difference) > 0.005 then
    raise exception 'Cash handed over plus CDM must equal Pending Runner Review Cash. Difference: BND %', to_char(v_difference, 'FM999999990.00');
  end if;

  select * into v_existing
  from public.finance_driver_end_jobs
  where driver_id = p_driver_id and job_date = p_job_date;
  v_previous_status := coalesce(v_existing.status, 'NOT_SUBMITTED');

  if v_photo_count = 0 and (
    v_existing.id is null
    or not exists (
      select 1 from public.finance_end_job_photos p
      where p.end_job_id = v_existing.id and p.deleted_at is null
    )
  ) then
    raise exception 'At least one receipt photo is required before submitting End Job';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_photo_paths, '{}'::text[])) as submitted(storage_path)
    where submitted.storage_path is null
      or submitted.storage_path = ''
      or split_part(submitted.storage_path, '/', 1) <> p_driver_id::text
  ) then
    raise exception 'Receipt photo upload is not valid for this Driver';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_photo_paths, '{}'::text[])) as submitted(storage_path)
    where not exists (
      select 1 from storage.objects object_row
      where object_row.bucket_id = 'finance-end-job-photos'
        and object_row.name = submitted.storage_path
    )
  ) then
    raise exception 'Receipt photo upload is incomplete. Please attach the photo again';
  end if;

  select rd.runner_id into v_runner
  from public.runner_drivers rd
  where rd.driver_id = p_driver_id and rd.is_active
  order by rd.created_at desc
  limit 1;
  if v_runner is null and v_existing.runner_id is not null then
    v_runner := v_existing.runner_id;
  end if;
  if v_runner is null then
    raise exception 'Driver is not linked to an active Runner';
  end if;

  insert into public.finance_driver_end_jobs (
    id, driver_id, runner_id, job_date, accepted_cash_expected, previous_accepted_cash,
    cash_handed, cdm_amount, declared_total, difference, status, note, needs_update_reason,
    submitted_at, created_by, updated_by
  ) values (
    coalesce(v_existing.id, gen_random_uuid()), p_driver_id, v_runner, p_job_date, v_expected,
    case when v_existing.id is null then null else v_existing.accepted_cash_expected end,
    v_cash_handed, v_cdm_amount, v_total, v_difference,
    'SUBMITTED', coalesce(p_note, ''), null, now(), v_actor, v_actor
  )
  on conflict (driver_id, job_date) do update set
    runner_id = excluded.runner_id,
    previous_accepted_cash = public.finance_driver_end_jobs.accepted_cash_expected,
    accepted_cash_expected = excluded.accepted_cash_expected,
    cash_handed = excluded.cash_handed,
    cdm_amount = excluded.cdm_amount,
    declared_total = excluded.declared_total,
    difference = excluded.difference,
    status = 'SUBMITTED',
    note = excluded.note,
    needs_update_reason = null,
    submitted_at = now(),
    updated_by = v_actor,
    updated_at = now()
  returning id into v_id;

  if v_photo_count > 0 then
    for v_photo_path in
      select distinct submitted.storage_path
      from unnest(p_photo_paths) as submitted(storage_path)
    loop
      insert into public.finance_end_job_photos(end_job_id, storage_path, uploaded_by)
      select v_id, v_photo_path, v_actor
      where not exists (
        select 1 from public.finance_end_job_photos p
        where p.end_job_id = v_id and p.storage_path = v_photo_path and p.deleted_at is null
      );
    end loop;
  end if;

  if not exists (
    select 1 from public.finance_end_job_photos p
    where p.end_job_id = v_id and p.deleted_at is null
  ) then
    raise exception 'At least one receipt photo is required before submitting End Job';
  end if;

  insert into public.finance_reconciliation_audit_logs(
    actor_id, actor_role, action, record_type, record_id, before_data, after_data
  ) values (
    v_actor, v_role, 'END_JOB_UPSERT', 'driver_end_job', v_id,
    case when v_existing.id is null then null else to_jsonb(v_existing) end,
    (select to_jsonb(j) from public.finance_driver_end_jobs j where j.id = v_id)
  );

  if v_runner <> v_actor and (
    v_existing.id is null
    or v_existing.status is distinct from 'SUBMITTED'
    or v_existing.cash_handed is distinct from v_cash_handed
    or v_existing.cdm_amount is distinct from v_cdm_amount
    or v_existing.note is distinct from coalesce(p_note, '')
    or v_photo_count > 0
  ) then
    select coalesce(p.display_name, p.email, 'Driver') into v_driver_name
    from public.profiles p
    where p.id = p_driver_id;
    insert into public.notifications(
      user_id, title, message, type, is_read, reference_type, reference_id,
      recipient_role, body, priority, entity_type, status_from, status_to
    ) values (
      v_runner,
      'Driver End Job submitted',
      format('%s submitted End Job for %s. Review the cash declaration and receipt photo in Finance Workspace.', coalesce(v_driver_name, 'Driver'), p_job_date),
      'finance_end_job_submitted',
      false,
      'finance_end_job',
      v_id,
      'runner',
      format('End Job submitted by %s for %s. Receipt photo attached for review.', coalesce(v_driver_name, 'Driver'), p_job_date),
      'high',
      'finance_end_job',
      v_previous_status,
      'SUBMITTED'
    );
  end if;

  return public.get_driver_end_job_context(p_driver_id, p_job_date);
end;
$$;

-- Keep the legacy RPC name for older clients, but apply the same photo rule.
create or replace function public.upsert_driver_end_job(
  p_driver_id uuid,
  p_job_date date,
  p_cash_handed numeric,
  p_cdm_amount numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  return public.upsert_driver_end_job_with_photos(
    p_driver_id, p_job_date, p_cash_handed, p_cdm_amount, p_note, '{}'::text[]
  );
end;
$$;

revoke execute on function public.upsert_driver_end_job_with_photos(uuid, date, numeric, numeric, text, text[]) from public, anon;
grant execute on function public.upsert_driver_end_job_with_photos(uuid, date, numeric, numeric, text, text[]) to authenticated;
revoke execute on function public.upsert_driver_end_job(uuid, date, numeric, numeric, text) from public, anon;
grant execute on function public.upsert_driver_end_job(uuid, date, numeric, numeric, text) to authenticated;

-- End Jobs must go through the RPC so the photo precondition cannot be
-- bypassed by a direct table write from the client.
revoke insert, update, delete on public.finance_driver_end_jobs from authenticated;
grant select on public.finance_driver_end_jobs to authenticated;

notify pgrst, 'reload schema';
