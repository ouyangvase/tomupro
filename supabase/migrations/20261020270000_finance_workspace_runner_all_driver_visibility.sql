-- Finance Workspace is a read-all operational view for Admin and Runner users.
-- Keep write RPCs scoped to the acting Runner; only the Finance read queries
-- are widened so every active Driver is visible.

do $$
declare
  v_sql text;
  v_photo_sql text;
begin
  select pg_get_functiondef(
    'public.get_finance_reconciliation_workspace(date,date,uuid,uuid,text,text,text,text,integer,integer)'::regprocedure
  ) into v_sql;

  v_sql := replace(v_sql, 'if v_role=''runner'' then v_runner:=v_actor;', 'if v_role=''runner'' then v_runner:=null;');
  v_sql := replace(v_sql, 'select distinct rd.driver_id,rd.runner_id', 'select distinct rd.driver_id, v_runner as runner_id');
  v_sql := replace(v_sql, 'join driver_scope ds on ds.driver_id=j.driver_id and ds.runner_id=j.runner_id', 'join driver_scope ds on ds.driver_id=j.driver_id');
  v_sql := replace(v_sql, 'join driver_scope dds on dds.driver_id=dj.driver_id and dds.runner_id=dj.runner_id', 'join driver_scope dds on dds.driver_id=dj.driver_id');

  -- Include every active Driver in the expanded daily list. A missing End Job
  -- is represented as NOT_SUBMITTED with zero declared amounts.
  v_sql := replace(v_sql, '''driver_id'',dj.driver_id', '''driver_id'',dds.driver_id');
  v_sql := replace(v_sql, '''accepted_cash'',round(dj.accepted_cash_expected,2)', '''accepted_cash'',round(coalesce(dj.accepted_cash_expected,0),2)');
  v_sql := replace(v_sql, '''cash_handed'',round(dj.cash_handed,2)', '''cash_handed'',round(coalesce(dj.cash_handed,0),2)');
  v_sql := replace(v_sql, '''cdm_amount'',round(dj.cdm_amount,2)', '''cdm_amount'',round(coalesce(dj.cdm_amount,0),2)');
  v_sql := replace(v_sql, '''difference'',round(dj.difference,2)', '''difference'',round(coalesce(dj.difference,0),2)');
  v_sql := replace(v_sql, '''status'',dj.status', '''status'',coalesce(dj.status,''NOT_SUBMITTED'')');
  v_sql := replace(v_sql, 'from public.finance_driver_end_jobs dj', 'from driver_scope dds left join public.finance_driver_end_jobs dj on dj.driver_id=dds.driver_id and dj.job_date=e.job_date');
  v_sql := replace(v_sql, 'join driver_scope dds on dds.driver_id=dj.driver_id', '');
  v_sql := replace(v_sql, 'left join public.profiles dp on dp.id=dj.driver_id', 'left join public.profiles dp on dp.id=dds.driver_id');
  v_sql := replace(v_sql, 'where dj.job_date=e.job_date', '');

  if position('if v_role=''runner'' then v_runner:=null;' in v_sql) = 0
     or position('from driver_scope dds' in v_sql) = 0 then
    raise exception 'Finance Workspace function source did not match the expected version';
  end if;
  execute v_sql;

  select pg_get_functiondef(
    'public.get_finance_end_job_photos(date,date,uuid,uuid)'::regprocedure
  ) into v_photo_sql;
  v_photo_sql := replace(v_photo_sql, 'v_runner := v_actor;', 'v_runner := null;');
  v_photo_sql := replace(v_photo_sql, 'if p_driver_id is not null and not private.finance_can_access_driver(p_driver_id) then', 'if false then');
  v_photo_sql := replace(v_photo_sql, '    and private.finance_can_access_driver(j.driver_id);', '    and true;');
  if position('v_runner := null;' in v_photo_sql) = 0
     or position('private.finance_can_access_driver(p_driver_id)' in v_photo_sql) > 0
     or position('and private.finance_can_access_driver(j.driver_id);' in v_photo_sql) > 0 then
    raise exception 'Finance receipt photo function source did not match the expected version';
  end if;
  execute v_photo_sql;
end;
$$;

drop policy if exists finance_end_job_photo_select on storage.objects;
create policy finance_end_job_photo_select on storage.objects for select to authenticated
using (bucket_id='finance-end-job-photos' and (
  private.finance_role() in ('admin','manager','runner')
  or split_part(name,'/',1)=auth.uid()::text
  or exists(select 1 from public.runner_drivers rd where rd.runner_id=auth.uid() and rd.driver_id=split_part(name,'/',1)::uuid and rd.is_active)
));

notify pgrst, 'reload schema';
