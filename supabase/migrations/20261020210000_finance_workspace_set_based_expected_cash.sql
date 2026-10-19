-- Filter accepted deliveries before calculating expected cash.
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
  -- Expected cash only comes from accepted deliveries. Keep payment totals
  -- set-based so a date-range request does not invoke a SQL function per order.
  cash_driver_scope as materialized (
    select distinct driver_id from driver_scope
  ),
  accepted_orders as materialized (
    select o.id,
      o.cod_amount,
      o.total_amount,
      o.payment_plan,
      o.payment_method,
      o.payment_history_unverified,
      o.driver_payment_method,
      o.driver_cash_amount,
      o.driver_transfer_amount,
      -- DRIVER_DELIVERED always has driver_delivered_at; this is the same
      -- event date returned by driver_analytics_effective_cohort_date.
      (o.driver_delivered_at at time zone 'Asia/Kuala_Lumpur')::date as effective_assignment_date
    from public.orders o
    join cash_driver_scope ds on ds.driver_id=o.driver_id
    where o.driver_status::text='DRIVER_DELIVERED'
      and coalesce(o.runner_accept_status::text,'')='ACCEPTED'
      and coalesce(o.runner_status::text,'')='DELIVERED'
      and coalesce(o.status::text,'') not in ('CANCELLED','CANCELED','RETURNED','REFUNDED')
      and coalesce(o.runner_status::text,'') not in ('CANCELLED','CANCELED','RETURNED','REFUNDED')
      and coalesce(o.delivery_area_code,'') not in ('SELF_PICKUP','CANCELLED')
      and upper(coalesce(o.order_source,'SALESPERSON')) not in ('TEST','DEMO')
      and (o.driver_delivered_at at time zone 'Asia/Kuala_Lumpur')::date between v_from and v_to
  ),
  transfer_totals as materialized (
    select op.order_id,
      coalesce(sum(op.amount) filter(where op.payment_type='TRANSFER' and op.source='CUSTOMER_PREPAYMENT' and op.status='CONFIRMED'),0)::numeric transfer_paid
    from public.order_payments op
    join accepted_orders ao on ao.id=op.order_id
    group by op.order_id
  ),
  payment_base as (
    select ao.id,
      ao.cod_amount,
      ao.payment_plan,
      ao.payment_method,
      ao.driver_payment_method,
      ao.driver_cash_amount,
      ao.driver_transfer_amount,
      ao.effective_assignment_date,
      ao.total_amount,
      ao.payment_history_unverified,
      coalesce(tt.transfer_paid,0)::numeric transfer_paid,
      case
        when upper(coalesce(ao.payment_plan::text,''))='TRANSFER'
          or (upper(coalesce(ao.payment_method::text,'')) in ('TRANSFER','BANK_TRANSFER') and coalesce(ao.cod_amount,0)<=0)
        then greatest(coalesce(tt.transfer_paid,0),coalesce(ao.total_amount,0))
        when ao.payment_history_unverified then 0
        when ao.payment_plan='COD' then greatest(ao.cod_amount,0)
        else greatest(coalesce(ao.total_amount,0)-coalesce(tt.transfer_paid,0),0)
      end::numeric as order_amount
    from accepted_orders ao
    left join transfer_totals tt on tt.order_id=ao.id
  ),
  expected_cash as materialized (
    select pb.effective_assignment_date as job_date,
      coalesce(sum(least(pb.cod_amount,greatest(0,case
        when upper(coalesce(pb.driver_payment_method,''))='TRANSFER' then 0
        when pb.driver_cash_amount is not null then pb.driver_cash_amount
        when upper(coalesce(pb.driver_payment_method,''))='CASH' then pb.order_amount
        when upper(coalesce(pb.driver_payment_method,''))='CASH_TRANSFER' then pb.order_amount-coalesce(pb.driver_transfer_amount,0)
        when upper(coalesce(pb.payment_method::text,'')) in ('COD','CASH') then pb.order_amount
        else 0 end))),0)::numeric expected_cash
    from payment_base pb
    group by pb.effective_assignment_date
  ),
  expected as (
    select c.job_date,coalesce(ec.expected_cash,0)::numeric expected_cash,
      (select count(*)::int from driver_scope) expected_driver_count
    from calendar c left join expected_cash ec on ec.job_date=c.job_date
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

revoke execute on function public.get_finance_reconciliation_workspace(date,date,uuid,uuid,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.get_finance_reconciliation_workspace(date,date,uuid,uuid,text,text,text,text,integer,integer) to authenticated;
