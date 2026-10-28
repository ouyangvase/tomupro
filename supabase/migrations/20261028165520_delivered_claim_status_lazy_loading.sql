-- Load only the selected Delivered claim-status scope before pagination.
-- Existing callers remain compatible: omitting p_claim_status keeps the old
-- all-status behavior.

drop function if exists public.get_runner_assistant_delivered_orders_report(uuid, uuid, uuid[], integer, integer);
drop function if exists public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer);

create function public.get_delivered_orders_fast_report(
  p_runner_id uuid default null,
  p_salesperson_id uuid default null,
  p_salesperson_ids uuid[] default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_claim_status text default null
)
returns table(
  id uuid, order_code text, order_date date, customer_name text, phone text, area text,
  address text, total_amount numeric, total_qty integer, payment_method text,
  runner_status text, reconciliation_status text, delivered_at timestamptz,
  driver_delivered_at timestamptz, driver_payment_method text, driver_cash_amount numeric,
  driver_transfer_amount numeric, salesperson_id uuid, salesperson_name text,
  runner_id uuid, runner_name text, driver_id uuid, driver_name text,
  items_summary text, items_json jsonb
)
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  with filtered_orders as (
    select o.*
    from public.orders o
    where o.current_operational_state = 'DELIVERED'
      and o.order_type <> 'MIRI_INBOUND_PICKUP'
      and auth.uid() is not null
      and (
        public.get_user_role(auth.uid())::text in ('admin', 'finance_viewer')
        or o.salesperson_id = auth.uid()
        or o.runner_id = auth.uid()
        or o.driver_id = auth.uid()
        or public.has_runner_assistant_permission(auth.uid(), o.runner_id, 'deliver')
        or (public.get_user_role(auth.uid())::text = 'runner'
            and private.can_runner_access_shared_workspace(o.runner_id))
        or (public.get_user_role(auth.uid())::text = 'manager'
            and o.salesperson_id = any(public.get_visible_owner_ids()))
        or exists (
          select 1
          from public.user_data_shares s
          where s.viewer_user_id = auth.uid()
            and s.subject_user_id = o.salesperson_id
            and s.active
            and s.scope_orders
        )
      )
      and (p_runner_id is null or o.runner_id = p_runner_id)
      and (p_salesperson_id is null or o.salesperson_id = p_salesperson_id)
      and (p_salesperson_ids is null or o.salesperson_id = any(p_salesperson_ids))
      and (
        nullif(trim(p_claim_status), '') is null
        or upper(trim(p_claim_status)) = 'ALL'
        or (upper(trim(p_claim_status)) = 'OPEN'
            and o.reconciliation_status in ('NOT_CLAIMED', 'ADMIN_ACK_PENDING', 'SP_ACK_PENDING'))
        or (upper(trim(p_claim_status)) = 'NOT_CLAIMED'
            and o.reconciliation_status = 'NOT_CLAIMED')
        or (upper(trim(p_claim_status)) = 'CLAIM_SUBMITTED'
            and o.reconciliation_status in ('ADMIN_ACK_PENDING', 'SP_ACK_PENDING'))
        or (upper(trim(p_claim_status)) = 'APPROVED'
            and o.reconciliation_status in ('CLAIMED', 'SETTLED'))
        or (upper(trim(p_claim_status)) = 'REJECTED'
            and o.reconciliation_status = 'DISPUTE')
      )
    order by coalesce(o.driver_delivered_at, o.delivered_at) desc nulls last, o.created_at desc
    limit p_limit offset p_offset
  )
  select
    o.id, o.order_code, o.order_date, o.customer_name, o.phone, o.area, o.address,
    private.order_sales_amount(o.id), o.total_qty, o.payment_method::text,
    o.runner_status::text, o.reconciliation_status::text, o.delivered_at,
    o.driver_delivered_at, o.driver_payment_method::text, o.driver_cash_amount,
    o.driver_transfer_amount, o.salesperson_id, sp.display_name, o.runner_id,
    rn.display_name, o.driver_id, dr.display_name,
    item_data.items_summary, item_data.items_json
  from filtered_orders o
  left join public.profiles sp on sp.id = o.salesperson_id
  left join public.profiles rn on rn.id = o.runner_id
  left join public.profiles dr on dr.id = o.driver_id
  left join lateral (
    select
      coalesce(string_agg(coalesce(p.sku_code, oi.sku_label, 'Item') || ' x' || oi.qty::text, ', '), 'No items') as items_summary,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', oi.id, 'product_id', oi.product_id, 'sku_code', p.sku_code,
        'sku_name', p.sku_name, 'sku_label', oi.sku_label, 'qty', oi.qty,
        'price', oi.price, 'line_total', oi.line_total
      )), '[]'::jsonb) as items_json
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    where oi.order_id = o.id
  ) item_data on true
  order by coalesce(o.driver_delivered_at, o.delivered_at) desc nulls last, o.created_at desc;
$function$;

create function public.get_runner_assistant_delivered_orders_report(
  p_runner_id uuid,
  p_salesperson_id uuid default null,
  p_salesperson_ids uuid[] default null,
  p_limit integer default 100,
  p_offset integer default 0,
  p_claim_status text default null
)
returns table(
  id uuid, order_code text, order_date date, customer_name text, phone text, area text,
  address text, total_amount numeric, total_qty integer, payment_method text,
  runner_status text, reconciliation_status text, delivered_at timestamptz,
  driver_delivered_at timestamptz, driver_payment_method text, driver_cash_amount numeric,
  driver_transfer_amount numeric, salesperson_id uuid, salesperson_name text,
  runner_id uuid, runner_name text, driver_id uuid, driver_name text,
  items_summary text, items_json jsonb, status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null
     or p_runner_id is null
     or not (
       (
         auth.uid() = p_runner_id
         and public.get_user_role(auth.uid())::text = 'runner'
       )
       or public.has_runner_assistant_permission(auth.uid(), p_runner_id, 'deliver')
     )
  then
    return;
  end if;

  return query
  select delivered.*, o.status::text
  from public.get_delivered_orders_fast_report(
    p_runner_id,
    p_salesperson_id,
    p_salesperson_ids,
    p_limit,
    p_offset,
    p_claim_status
  ) as delivered
  join public.orders o on o.id = delivered.id;
end;
$function$;

revoke all on function public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer, text) from public;
grant execute on function public.get_delivered_orders_fast_report(uuid, uuid, uuid[], integer, integer, text) to authenticated;
revoke all on function public.get_runner_assistant_delivered_orders_report(uuid, uuid, uuid[], integer, integer, text) from public;
grant execute on function public.get_runner_assistant_delivered_orders_report(uuid, uuid, uuid[], integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
