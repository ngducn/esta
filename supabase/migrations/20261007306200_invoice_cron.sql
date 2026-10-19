-- The daily cron's invoicing and lease ends (SPEC §5.4, §7.4, LSE-2, LSE-3, LSE-5). As with activation, invoices are
-- written only here: apps/web/src/server/cron passes the date and instant of its Clock and never plans or inserts.

-- issue_invoices now reports what it did, and an ended lease still issues a draft it owes: a metered lease's last
-- period issues on its due date, which can fall after end_date, and lease-status runs before invoices each night. It
-- owes only periods that start by its end_date, and only once that date has passed; with no end_date it owes none.
drop function private.issue_invoices(uuid, date, timestamptz);

create function private.issue_invoices(p_lease_id uuid, p_as_of date, p_issued_at timestamptz, out drafted integer, out issued integer)
language plpgsql
set search_path = ''
as $$
declare
  v_lease public.leases;
  v_plan record;
  v_id uuid;
  v_constraint text;
begin
  drafted := 0;
  select * into v_lease from public.leases l where l.id = p_lease_id for no key update;
  if v_lease.status is null or v_lease.status not in ('active', 'ended') then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  if v_lease.status = 'active' then
    for v_plan in select * from private.plan_invoices(v_lease, p_as_of) loop
      continue when exists (
        select 1 from public.invoices i
        where i.lease_id = v_lease.id and daterange(i.period_start, i.period_end, '[]') && daterange(v_plan.period_start, v_plan.period_end, '[]')
      );
      for attempt in 1 .. 5 loop
        begin
          insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
          values (v_lease.household_id, v_lease.id, v_plan.period_start, v_plan.period_end, v_plan.due_date, v_plan.issue_on)
          returning id into v_id;
          exit;
        exception when unique_violation then
          get stacked diagnostics v_constraint = constraint_name;
          if v_constraint <> 'invoices_household_id_memo_code_key' or attempt = 5 then
            raise;
          end if;
        end;
      end loop;
      insert into public.invoice_lines (household_id, invoice_id, kind, quantity, unit_price_vnd, amount_vnd)
      values (v_lease.household_id, v_id, 'rent', 1, v_plan.rent_vnd, v_plan.rent_vnd);
      drafted := drafted + 1;
    end loop;
  end if;
  update public.invoices i set status = 'issued', issued_at = p_issued_at
  where i.lease_id = p_lease_id and i.status = 'draft' and i.issue_on <= p_as_of
    and (v_lease.status = 'active' or (v_lease.end_date < p_as_of and i.period_start <= v_lease.end_date));
  get diagnostics issued = row_count;
end;
$$;
revoke all on function private.issue_invoices(uuid, date, timestamptz) from public;

-- One household's nightly run: every active lease drafts what it owes on p_as_of, and every draft whose issue day has
-- come issues at p_issued_at. Leases go in id order, so two overlapping runs lock them in the same order, and the
-- second inserts nothing.
create function public.run_invoicing(p_household_id uuid, p_as_of date, p_issued_at timestamptz)
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
    where l.household_id = p_household_id and (
      l.status = 'active'
      or (l.status = 'ended' and exists (
        select 1 from public.invoices i where i.lease_id = l.id and i.status = 'draft' and i.issue_on <= p_as_of
      ))
    )
    order by l.id
  loop
    select * into v_done from private.issue_invoices(v_lease, p_as_of, p_issued_at);
    drafted := drafted + v_done.drafted;
    issued := issued + v_done.issued;
  end loop;
  return next;
end;
$$;
revoke all on function public.run_invoicing(uuid, date, timestamptz) from public, anon, authenticated;
grant execute on function public.run_invoicing(uuid, date, timestamptz) to service_role;

-- LSE-2: an active lease whose last day is before p_as_of has ended.
create function public.end_expired_leases(p_as_of date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ended integer;
begin
  if p_as_of is null then
    raise exception 'ESTA_CRON_ARGUMENTS' using errcode = '22004';
  end if;
  update public.leases l set status = 'ended' where l.status = 'active' and l.end_date < p_as_of;
  get diagnostics v_ended = row_count;
  return v_ended;
end;
$$;
revoke all on function public.end_expired_leases(date) from public, anon, authenticated;
grant execute on function public.end_expired_leases(date) to service_role;
