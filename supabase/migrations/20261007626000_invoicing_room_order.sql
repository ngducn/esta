-- The nightly run still takes its leases in one fixed order, so two runs lock the same rows in the same sequence and
-- cannot deadlock. The order is now each property's rooms as Mẹ arranged them, so the numbers a run gives out within a
-- property and month follow the room order (#143). Numbers already issued do not change.
create or replace function public.run_invoicing(p_household_id uuid, p_as_of date, p_issued_at timestamptz)
returns table (drafted integer, issued integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease uuid;
  v_done record;
begin
  if p_household_id is null or p_as_of is null or p_issued_at is null then
    raise exception 'ESTA_CRON_ARGUMENTS' using errcode = '22004';
  end if;
  drafted := 0;
  issued := 0;
  for v_lease in
    select l.id from public.leases l
    join public.units u on u.id = l.unit_id
    where l.household_id = p_household_id and (
      l.status = 'active'
      or (l.status = 'terminated' and l.end_date >= p_as_of)
      or (l.status in ('ended', 'terminated') and exists (
        select 1 from public.invoices i where i.lease_id = l.id and i.status = 'draft' and i.issue_on <= p_as_of
      ))
    )
    order by l.property_id, u.sort_order, u.label, u.id, l.id
  loop
    select * into v_done from private.issue_invoices(v_lease, p_as_of, p_issued_at);
    drafted := drafted + v_done.drafted;
    issued := issued + v_done.issued;
  end loop;
  return next;
end;
$$;
