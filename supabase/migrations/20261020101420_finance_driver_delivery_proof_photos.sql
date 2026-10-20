-- Show Driver delivery proof photos alongside the Finance daily Driver row.
-- These are separate from End Job receipt photos: delivery proof can be
-- opened by Finance, while only End Job receipt photos are reviewable here.

create or replace function public.get_finance_driver_proof_photos(
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

  with driver_scope as materialized (
    select rd.driver_id, (array_agg(rd.runner_id order by rd.created_at desc))[1] as runner_id
    from public.runner_drivers rd
    where rd.is_active
      and (v_runner is null or rd.runner_id = v_runner)
      and (p_driver_id is null or rd.driver_id = p_driver_id)
    group by rd.driver_id
  ),
  proofs as (
    select distinct
      a.id,
      o.driver_id,
      ds.runner_id,
      (a.uploaded_at at time zone 'Asia/Brunei')::date as job_date,
      coalesce(dp.display_name, dp.email, 'Driver') as driver_name,
      a.url as photo_url,
      a.uploaded_at,
      coalesce(o.order_code, o.id::text) as order_code
    from public.attachments a
    join public.orders o on o.id = a.order_id
    join driver_scope ds on ds.driver_id = o.driver_id
    left join public.profiles dp on dp.id = o.driver_id
    where a.type = 'delivery_photo'
      and (a.uploaded_at at time zone 'Asia/Brunei')::date between v_from and v_to
      and private.finance_can_access_driver(o.driver_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'driver_id', p.driver_id,
    'runner_id', p.runner_id,
    'job_date', p.job_date,
    'driver_name', p.driver_name,
    'photo_url', p.photo_url,
    'uploaded_at', p.uploaded_at,
    'order_code', p.order_code,
    'source', 'DELIVERY_PROOF'
  ) order by p.job_date desc, p.uploaded_at desc), '[]'::jsonb)
  into v_result
  from proofs p;

  return v_result;
end;
$$;

revoke execute on function public.get_finance_driver_proof_photos(date,date,uuid,uuid) from public, anon;
grant execute on function public.get_finance_driver_proof_photos(date,date,uuid,uuid) to authenticated;

comment on function public.get_finance_driver_proof_photos(date,date,uuid,uuid) is
  'Returns Driver delivery proof photos in the Finance scope. End Job receipt photos remain in get_finance_end_job_photos and have separate review state.';

notify pgrst, 'reload schema';
