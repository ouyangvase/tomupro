-- Keep an End Job's cash basis stable when Runner review completes.
--
-- Pending Runner Review cash is the primary basis while there are pending
-- cash orders. Once those orders are accepted, pending cash becomes zero;
-- that transition must roll forward to Accepted Cash instead of making an
-- existing declaration appear short by the full submitted amount.
-- Accepted Cash is the existing cash-only metric and excludes transfer.

create or replace function private.finance_driver_end_job_expected_cash(
  p_driver_id uuid,
  p_job_date date
)
returns numeric
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with pending as (
    select coalesce(sum(greatest(coalesce(cohort.cash_pending_amount, 0), 0)), 0)::numeric as amount
    from private.get_driver_analytics_cohort(p_driver_id, p_job_date, p_job_date) cohort
    where cohort.pending_acceptance
      and cohort.driver_status = 'DRIVER_DELIVERED'
      and coalesce(cohort.cash_pending_amount, 0) > 0
  )
  select case
    when pending.amount > 0 then round(pending.amount, 2)
    else round(private.finance_driver_expected_cash(p_driver_id, p_job_date), 2)
  end
  from pending;
$$;

revoke all on function private.finance_driver_end_job_expected_cash(uuid, date) from public;

-- Repair active records created before the roll-forward function existed.
-- Locked historical jobs are intentionally left unchanged.
with recalculated as (
  select
    j.id,
    j.accepted_cash_expected as old_expected,
    round(private.finance_driver_end_job_expected_cash(j.driver_id, j.job_date), 2) as new_expected,
    j.declared_total
  from public.finance_driver_end_jobs j
  where j.status <> 'LOCKED'
    and j.job_date between (now() at time zone 'Asia/Brunei')::date - 2
                        and (now() at time zone 'Asia/Brunei')::date
), changed as (
  select *
  from recalculated
  where old_expected is distinct from new_expected
)
update public.finance_driver_end_jobs j
set
  previous_accepted_cash = changed.old_expected,
  accepted_cash_expected = changed.new_expected,
  difference = round(changed.new_expected - changed.declared_total, 2),
  status = case
    when abs(round(changed.new_expected - changed.declared_total, 2)) <= 0.005 then 'SUBMITTED'
    else 'NEEDS_UPDATE'
  end,
  needs_update_reason = case
    when abs(round(changed.new_expected - changed.declared_total, 2)) <= 0.005 then null
    else format(
      'Pending Runner Review Cash changed from BND %s to BND %s',
      to_char(changed.old_expected, 'FM999999990.00'),
      to_char(changed.new_expected, 'FM999999990.00')
    )
  end,
  updated_at = now()
from changed
where j.id = changed.id;
