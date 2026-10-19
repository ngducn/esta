-- The database is the one rent planner (#195). private.lease_periods writes every invoice through plan_invoices, and
-- public.lease_schedule hands the same periods to every screen that shows or sums them, so nothing in TypeScript plans
-- rent a second time.

-- Each lease's periods starting on or before p_until (and its end date), with its amendments and increases, beside the
-- invoice that bills each one: the live invoice whose start falls in the period, since a paid-through date or a
-- termination can shorten the stretch it bills. A lease the caller cannot see, or a draft without a start or a rent,
-- has no rows. It reads no clock: the caller's Clock picks p_until.
create function public.lease_schedule(p_lease_ids uuid[], p_until date)
returns table (
  lease_id uuid, period_start date, period_end date, due_date date, cycle_months integer, monthly_rent_vnd bigint,
  rent_vnd bigint, prorated boolean, covered_by_paid_through boolean, invoice_id uuid, invoice_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id, s.period_start, s.period_end, s.period_start + l.due_offset_days, s.cycle_months, s.monthly_rent_vnd, s.rent_vnd,
    s.prorated, coalesce(s.period_end <= l.paid_through_date, false), i.id, i.status
  from public.leases l
  cross join lateral private.lease_periods(l, p_until) s
  left join lateral (
    select i.id, i.status from public.invoices i
    where i.lease_id = l.id and i.status <> 'void' and i.period_start between s.period_start and s.period_end
    order by i.period_start
    limit 1
  ) i on true
  where l.id = any (p_lease_ids) and l.start_date is not null and l.rent_vnd is not null
    and private.is_member(l.household_id, 'viewer')
  order by l.id, s.period_start;
$$;
revoke all on function public.lease_schedule(uuid[], date) from public, anon;
grant execute on function public.lease_schedule(uuid[], date) to authenticated;

-- One draft issues on p_as_of, before the day the nightly job would issue it: the path a member's manual issue and
-- P3-14's readings trigger share (SPEC §5.4, LSE-5). Until they call it, only the seed does, standing in for Dĩ An's
-- September meter entry on 2026-10-03 (SPEC §9.3).
create function private.issue_invoice(p_invoice_id uuid, p_as_of date, p_issued_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_as_of is null or p_issued_at is null then
    raise exception 'ESTA_ISSUE_ARGUMENTS' using errcode = '22004';
  end if;
  update public.invoices i set status = 'issued', issued_at = p_issued_at, issue_on = p_as_of
  where i.id = p_invoice_id and i.status = 'draft';
  if not found then
    raise exception 'ESTA_INVOICE_NOT_DRAFT' using errcode = '55000';
  end if;
end;
$$;
revoke all on function private.issue_invoice(uuid, date, timestamptz) from public;
