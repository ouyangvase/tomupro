-- Runner Finance Workspace displays the receipt-photo confirmation control for
-- the same all-driver read scope as the photo query. Keep the change limited to
-- that review marker; cash totals, End Job declarations and order state are not
-- changed.

create or replace function private.finance_end_job_photo_review_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
begin
  if private.finance_role() not in ('admin','manager','runner') then
    if tg_op = 'INSERT' and coalesce(new.confirmed, false) then
      raise exception 'Receipt photo review is not permitted';
    elsif tg_op = 'UPDATE' and (
      new.confirmed is distinct from old.confirmed
      or new.confirmed_by is distinct from old.confirmed_by
      or new.confirmed_at is distinct from old.confirmed_at
    ) then
      raise exception 'Receipt photo review is not permitted';
    end if;
  end if;
  return new;
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
  if v_actor is null or v_role not in ('admin','manager','runner') then
    raise exception 'Receipt photo review is not permitted';
  end if;

  select to_jsonb(p), j.driver_id
  into v_before, v_driver_id
  from public.finance_end_job_photos p
  join public.finance_driver_end_jobs j on j.id = p.end_job_id
  where p.id = p_photo_id and p.deleted_at is null;
  if v_before is null or (v_role <> 'runner' and not private.finance_can_access_driver(v_driver_id)) then
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

revoke execute on function public.review_finance_end_job_photo(uuid,boolean) from public, anon;
grant execute on function public.review_finance_end_job_photo(uuid,boolean) to authenticated;
