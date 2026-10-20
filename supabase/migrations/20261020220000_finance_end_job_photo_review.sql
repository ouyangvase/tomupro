-- Expose Driver End Job receipt photos to the Finance Workspace and keep a
-- separate review marker for each photo. This does not change cash totals or
-- any End Job calculation.

alter table public.finance_end_job_photos
  add column if not exists confirmed boolean not null default false,
  add column if not exists confirmed_by uuid references public.profiles(id),
  add column if not exists confirmed_at timestamptz;

create index if not exists finance_end_job_photos_review_idx
  on public.finance_end_job_photos (confirmed, deleted_at, end_job_id);

create or replace function public.get_finance_end_job_photos(
  p_date_from date default null,
  p_date_to date default null,
  p_runner_id uuid default null,
  p_driver_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := private.finance_role();
  v_from date := coalesce(p_date_from, (now() at time zone 'Asia/Brunei')::date);
  v_to date := coalesce(p_date_to, v_from);
  v_runner uuid := p_runner_id;
  v_result jsonb;
begin
  if v_actor is null or v_role not in ('admin','manager','runner') then
    raise exception 'Finance Workspace access is not permitted';
  end if;
  if v_role = 'runner' then
    v_runner := v_actor;
  elsif v_runner is not null and not private.finance_can_manage_runner(v_runner) then
    raise exception 'Runner scope is not permitted';
  end if;
  if v_to < v_from then
    raise exception 'Invalid finance date range';
  end if;
  if p_driver_id is not null and not private.finance_can_access_driver(p_driver_id) then
    raise exception 'Driver scope is not permitted';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'end_job_id', j.id,
    'driver_id', j.driver_id,
    'runner_id', j.runner_id,
    'job_date', j.job_date,
    'driver_name', coalesce(dp.display_name, dp.email, 'Driver'),
    'storage_path', p.storage_path,
    'uploaded_at', p.uploaded_at,
    'confirmed', p.confirmed,
    'confirmed_by', p.confirmed_by,
    'confirmed_at', p.confirmed_at
  ) order by j.job_date desc, p.uploaded_at desc), '[]'::jsonb)
  into v_result
  from public.finance_end_job_photos p
  join public.finance_driver_end_jobs j on j.id = p.end_job_id
  join public.runner_drivers rd on rd.driver_id = j.driver_id
    and rd.runner_id = j.runner_id
    and rd.is_active
  left join public.profiles dp on dp.id = j.driver_id
  where p.deleted_at is null
    and j.job_date between v_from and v_to
    and (v_runner is null or j.runner_id = v_runner)
    and (p_driver_id is null or j.driver_id = p_driver_id)
    and private.finance_can_access_driver(j.driver_id);

  return v_result;
end;
$$;

create or replace function public.review_finance_end_job_photo(
  p_photo_id uuid,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := private.finance_role();
  v_before jsonb;
  v_after jsonb;
  v_driver_id uuid;
begin
  if v_actor is null or v_role not in ('admin','manager') then
    raise exception 'Receipt photo review is not permitted';
  end if;

  select to_jsonb(p), j.driver_id
  into v_before, v_driver_id
  from public.finance_end_job_photos p
  join public.finance_driver_end_jobs j on j.id = p.end_job_id
  where p.id = p_photo_id and p.deleted_at is null;
  if v_before is null or not private.finance_can_access_driver(v_driver_id) then
    raise exception 'Receipt photo is not accessible';
  end if;

  update public.finance_end_job_photos
  set confirmed = coalesce(p_confirmed, false),
      confirmed_by = case when coalesce(p_confirmed, false) then v_actor else null end,
      confirmed_at = case when coalesce(p_confirmed, false) then now() else null end
  where id = p_photo_id;
  select to_jsonb(p) into v_after
  from public.finance_end_job_photos p
  where p.id = p_photo_id;

  insert into public.finance_reconciliation_audit_logs(
    actor_id, actor_role, action, record_type, record_id, before_data, after_data
  ) values (
    v_actor, v_role, 'END_JOB_PHOTO_REVIEW', 'end_job_photo', p_photo_id, v_before, v_after
  );

  return v_after;
end;
$$;

revoke execute on function public.get_finance_end_job_photos(date,date,uuid,uuid) from public, anon;
revoke execute on function public.review_finance_end_job_photo(uuid,boolean) from public, anon;
grant execute on function public.get_finance_end_job_photos(date,date,uuid,uuid) to authenticated;
grant execute on function public.review_finance_end_job_photo(uuid,boolean) to authenticated;
