-- Meter corrections after a bill went out (the 2026-10-21 audit of LSE-4 and LSE-5). A correction's credit must fit in
-- the bill it lands on, so save_meter_readings refuses one that would take that bill below zero; and terminate_lease
-- says how many meter months its lease can no longer bill, with the count save_meter_readings already gave, now in
-- one function both call.

-- What each meter month of the lease's chain is owed or was over-billed (LSE-4), from 20261007402600 meter_lines: the
-- month's use (due) and what issued bills charged for it (billed), with the chain's first bill that is not void and
-- starts after the month (invoice_id). A month that bill drafts (drafted) becomes a utility line on it; any other goes
-- on the chain's earliest draft as an adjustment.
create function private.meter_owed(p_lease public.leases)
returns table (
  invoice_id uuid, lease_id uuid, drafted boolean, reading_month date, meter_id uuid, kind text, price bigint, previous integer,
  reading integer, due integer, billed integer
)
language sql
stable
set search_path = ''
as $$
  with chain as materialized (
    select c.lease_id from private.lease_chain(p_lease.id) c
  ),
  bills as (
    select i.id, i.lease_id, i.status, i.period_start, i.period_end
    from public.invoices i
    where i.lease_id in (select c.lease_id from chain c)
  ),
  reach as (
    select (date_trunc('month', b.period_start)::date - make_interval(months => greatest(1, private.months_until(b.period_start, b.period_end + 1))))::date as month
    from bills b
    order by b.period_start
    limit 1
  )
  select
    b.id, b.lease_id, not w.charged and b.status = 'draft', u.reading_month, u.meter_id, m.kind,
    (m.pricing ->> 'unit_price_vnd')::bigint, u.previous_reading, u.reading, coalesce(u.used, 0),
    coalesce((
      select sum(case when l.unit_price_vnd < 0 then -l.quantity else l.quantity end)
      from public.invoice_lines l
      join public.invoices i on i.id = l.invoice_id
      where i.status = 'issued' and l.meter_id = u.meter_id and l.reading_month = u.reading_month
    ), 0)::integer
  from public.meter_usage u
  join public.meters m on m.id = u.meter_id and m.unit_id = p_lease.unit_id
  cross join lateral private.meter_month_owner(u.meter_id, u.reading_month) w
  left join lateral (
    select b.id, b.lease_id, b.status from bills b
    where b.status <> 'void' and b.period_start > private.month_end(u.reading_month)
    order by b.period_start
    limit 1
  ) b on true
  where w.lease_id in (select c.lease_id from chain c)
    and (w.charged or b.id is not null)
    and u.reading_month >= (select r.month from reach r);
$$;
revoke all on function private.meter_owed(public.leases) from public;

create or replace function private.meter_lines(p_lease public.leases)
returns table (
  invoice_id uuid, kind text, meter_id uuid, reading_month date, quantity integer, unit_price_vnd bigint, amount_vnd bigint,
  description text, sort_order integer
)
language sql
stable
set search_path = ''
as $$
  with owed as materialized (
    select * from private.meter_owed(p_lease)
  ),
  next_draft as (
    select i.id, i.lease_id from public.invoices i
    where i.lease_id in (select c.lease_id from private.lease_chain(p_lease.id) c) and i.status = 'draft'
    order by i.period_start
    limit 1
  )
  select
    o.invoice_id, o.kind, o.meter_id, o.reading_month, o.due - o.billed, o.price, (o.due - o.billed) * o.price,
    format('Tiền %s tháng %s: %s %s (%s → %s)', case o.kind when 'electricity' then 'điện' else 'nước' end, to_char(o.reading_month, 'MM/YYYY'),
      private.grouped(o.due - o.billed), case o.kind when 'electricity' then 'kWh' else 'm³' end, private.grouped(o.previous), private.grouped(o.reading)),
    case o.kind when 'electricity' then 1 else 2 end
  from owed o
  where o.drafted and o.lease_id = p_lease.id and o.due > o.billed
  union all
  select
    d.id, 'adjustment', o.meter_id, o.reading_month, abs(o.due - o.billed), case when o.due > o.billed then o.price else -o.price end, (o.due - o.billed) * o.price,
    format('Điều chỉnh tiền %s tháng %s: %s%s %s', case o.kind when 'electricity' then 'điện' else 'nước' end, to_char(o.reading_month, 'MM/YYYY'),
      case when o.due > o.billed then '+' else '-' end, private.grouped(abs(o.due - o.billed)), case o.kind when 'electricity' then 'kWh' else 'm³' end),
    3
  from owed o
  cross join next_draft d
  where not o.drafted and d.lease_id = p_lease.id and o.due <> o.billed;
$$;

-- [app rule] A meter correction's credit fits in the bill it lands on: no draft of the lease's chain, and no bill issued
-- at p_issued_at, totals below zero; and before the chain's next period is drafted, that period's rent covers the
-- adjustments waiting for it. A chain with no period left has no bill for a credit to take below zero.
create function private.meter_credit_fits(p_lease public.leases, p_issued_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  with chain as materialized (
    select c.lease_id from private.lease_chain(p_lease.id) c
  ),
  bills as materialized (
    select i.id, i.status, i.issued_at, i.period_start from public.invoices i where i.lease_id in (select c.lease_id from chain c)
  ),
  next_period as (
    select s.rent_vnd
    from chain c
    join public.leases l on l.id = c.lease_id
    cross join lateral private.lease_periods(l, ((select max(b.period_start) from bills b) + interval '12 months')::date) s
    where s.period_start > (select max(b.period_start) from bills b)
    order by s.period_start
    limit 1
  )
  select not exists (
      select 1 from bills b
      where (b.status = 'draft' or (b.status = 'issued' and b.issued_at = p_issued_at))
        and (select sum(l.amount_vnd) from public.invoice_lines l where l.invoice_id = b.id) < 0
    )
    and (
      exists (select 1 from bills b where b.status = 'draft')
      or coalesce((select n.rent_vnd from next_period n)
        + (select coalesce(sum((o.due - o.billed) * o.price), 0) from private.meter_owed(p_lease) o where not o.drafted), 0) >= 0
    );
$$;
revoke all on function private.meter_credit_fits(public.leases, timestamptz) from public;

-- [app rule] The meter months of these meters that no bill will carry: use not yet billed in full whose owner's chain
-- has no bill left to carry it (the last month of a lease not renewed, a reading entered after the chain's last bill,
-- or a month whose bill was voided before the lease ended early). They are billed to no one, never to another tenant.
create function private.unbilled_meter_months(p_meter_ids uuid[])
returns table (meter_id uuid, reading_month date, lease_id uuid)
language sql
stable
set search_path = ''
as $$
  with owned as materialized (
    select u.meter_id, u.reading_month, w.lease_id
    from public.meter_usage u
    cross join lateral private.meter_month_owner(u.meter_id, u.reading_month) w
    where u.meter_id = any (p_meter_ids) and u.used > 0 and u.used <> coalesce((
      select sum(case when il.unit_price_vnd < 0 then -il.quantity else il.quantity end)
      from public.invoice_lines il
      join public.invoices i on i.id = il.invoice_id
      where i.status = 'issued' and il.meter_id = u.meter_id and il.reading_month = u.reading_month
    ), 0)
  )
  select w.meter_id, w.reading_month, w.lease_id
  from owned w
  join public.leases o on o.id = w.lease_id and o.utilities_mode = 'metered_by_owner'
  where not exists (
    select 1 from private.lease_chain(o.id) c
    join public.leases l on l.id = c.lease_id
    where l.end_date is null
      or exists (
        select 1 from public.invoices i
        where i.lease_id = l.id and i.status = 'draft' and i.period_start > private.month_end(w.reading_month)
      )
      or exists (
        select 1 from private.lease_periods(l, l.end_date) s
        where s.period_start > private.month_end(w.reading_month)
          and s.period_start > coalesce((select max(i.period_start) from public.invoices i where i.lease_id = l.id), l.start_date - 1)
      )
  );
$$;
revoke all on function private.unbilled_meter_months(uuid[]) from public;

-- The 20261007402600 save, refusing a correction whose credit does not fit in its bill (private.meter_credit_fits).
-- Mẹ voids the bill that charged the old reading instead, which bills the month again at the new one.
create or replace function public.save_meter_readings(p_property_id uuid, p_reading_month date, p_readings jsonb)
returns table (saved integer, issued integer, unbilled integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_now timestamptz := private.audit_now();
  v_today date := private.business_date(v_now);
  v_units uuid[];
  v_leases uuid[];
  v_lease uuid;
  v_done record;
begin
  select p.household_id into v_household
  from public.properties p
  where p.id = p_property_id and p.deleted_at is null and private.is_member(p.household_id, 'member');
  if not found then
    raise exception 'ESTA_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_reading_month is null or extract(day from p_reading_month) <> 1 or p_reading_month > date_trunc('month', v_today)::date then
    raise exception 'ESTA_READING_MONTH' using errcode = '22023';
  end if;
  if jsonb_typeof(p_readings) is distinct from 'array' or jsonb_array_length(p_readings) = 0 or exists (
    select 1 from jsonb_array_elements(p_readings) e
    where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'reading') is distinct from 'number' or e ->> 'reading' !~ '^[0-9]{1,9}$'
      or coalesce(e ->> 'meter_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'ESTA_READING_INVALID' using errcode = '22023';
  end if;
  select array_agg(distinct m.unit_id) into v_units
  from jsonb_array_elements(p_readings) e
  join public.meters m on m.id = (e ->> 'meter_id')::uuid and m.property_id = p_property_id and m.household_id = v_household and m.active;
  if (select count(distinct e ->> 'meter_id') from jsonb_array_elements(p_readings) e) <> jsonb_array_length(p_readings)
    or (select count(*) from public.meters m where m.id in (select (e ->> 'meter_id')::uuid from jsonb_array_elements(p_readings) e)
      and m.property_id = p_property_id and m.household_id = v_household and m.active) <> jsonb_array_length(p_readings) then
    raise exception 'ESTA_READING_METER' using errcode = '22023';
  end if;

  insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on)
  select v_household, (e ->> 'meter_id')::uuid, p_reading_month, (e ->> 'reading')::integer, v_today
  from jsonb_array_elements(p_readings) e
  order by e ->> 'meter_id'
  on conflict (meter_id, reading_month) do update set reading = excluded.reading, read_on = excluded.read_on
  where meter_readings.reading <> excluded.reading;
  get diagnostics saved = row_count;

  v_leases := array(
    select l.id from public.leases l
    where l.unit_id = any (v_units) and l.utilities_mode = 'metered_by_owner' and (
      l.status = 'active'
      or (l.status = 'terminated' and l.end_date >= v_today)
      or (l.status in ('ended', 'terminated') and exists (select 1 from public.invoices i where i.lease_id = l.id and i.status = 'draft'))
    )
    order by l.id
  );
  issued := 0;
  foreach v_lease in array v_leases loop
    select * into v_done from private.issue_invoices(v_lease, v_today, v_now);
    issued := issued + v_done.issued;
  end loop;
  if exists (select 1 from public.leases l where l.id = any (v_leases) and not private.meter_credit_fits(l, v_now)) then
    raise exception 'ESTA_READING_CORRECTION_TOO_LARGE' using errcode = '55000';
  end if;

  -- The screen says how many of this month's readings no bill will carry, so Mẹ can renew the lease, collect them
  -- herself or deduct them from the deposit.
  select count(*)::integer into unbilled
  from private.unbilled_meter_months(array(select (e ->> 'meter_id')::uuid from jsonb_array_elements(p_readings) e)) u
  where u.reading_month = p_reading_month;
  return next;
end;
$$;

-- The 20261007306700 termination, now returning how many meter months its lease can no longer bill: a month whose bill
-- Mẹ voided so the lease could end before it is billed to no one (private.unbilled_meter_months).
drop function public.terminate_lease(uuid, date, text);
create function public.terminate_lease(p_lease_id uuid, p_terminated_on date, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases := private.member_lease(p_lease_id);
  v_now timestamptz := private.audit_now();
begin
  if v_lease.status <> 'active' then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'ESTA_TERMINATION_REASON' using errcode = '22023';
  end if;
  if p_terminated_on is null or p_terminated_on < v_lease.start_date or p_terminated_on > v_lease.end_date then
    raise exception 'ESTA_TERMINATION_DATE' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices i where i.lease_id = v_lease.id and i.status = 'issued' and i.period_start > p_terminated_on) then
    raise exception 'ESTA_TERMINATION_BEFORE_ISSUED' using errcode = '22023';
  end if;
  delete from public.invoices i where i.lease_id = v_lease.id and i.status = 'draft' and i.period_end > p_terminated_on;
  update public.leases l
  set status = 'terminated', terminated_on = p_terminated_on, end_date = p_terminated_on, termination_reason = btrim(p_reason)
  where l.id = v_lease.id;
  perform private.issue_invoices(v_lease.id, least(private.business_date(v_now), p_terminated_on), v_now);
  return (
    select count(*)::integer
    from private.unbilled_meter_months(array(select m.id from public.meters m where m.unit_id = v_lease.unit_id)) u
    where u.lease_id in (select c.lease_id from private.lease_chain(v_lease.id) c)
  );
end;
$$;
revoke all on function public.terminate_lease(uuid, date, text) from public, anon;
grant execute on function public.terminate_lease(uuid, date, text) to authenticated;
