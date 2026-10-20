-- What activation would bill for lease terms that may not be stored yet, such as a lease Claude plans in the same
-- connector batch as its room: preview_activation's answer from the terms as jsonb, through the same planner and the
-- database clock's date. Security definer only because private.plan_invoices is not executable by authenticated, so it
-- checks the caller's membership of p_household_id itself before anything else. It clears the lease id, so
-- private.lease_periods reads no amendment, and takes the household from its argument, so it reads no household's row.
create function public.preview_lease_bills(p_household_id uuid, p_lease jsonb, p_paid_through date default null)
returns table (period_start date, period_end date, due_date date, rent_vnd bigint, issues_now boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lease public.leases;
  v_today date;
begin
  if not private.is_member(p_household_id, 'member') then
    raise exception 'ESTA_LEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_lease := jsonb_populate_record(null::public.leases, p_lease);
  -- A populated record skips the table's checks, and a cycle of 0 months would never end.
  if v_lease.billing_cycle_months is null or v_lease.billing_cycle_months not in (1, 3, 6, 12) or v_lease.due_offset_days is null then
    raise exception 'ESTA_LEASE_TERMS' using errcode = '22023';
  end if;
  if v_lease.start_date is null or v_lease.rent_vnd is null then
    return;
  end if;
  v_lease.id := null;
  v_lease.household_id := p_household_id;
  v_lease.paid_through_date := p_paid_through;
  v_today := private.business_date(private.audit_now());
  return query
    select p.period_start, p.period_end, p.due_date, p.rent_vnd, p.issue_on <= v_today
    from private.plan_invoices(v_lease, v_today) p;
end;
$$;
revoke all on function public.preview_lease_bills(uuid, jsonb, date) from public, anon;
grant execute on function public.preview_lease_bills(uuid, jsonb, date) to authenticated;
