-- Meters and monthly readings (SPEC §5.4, LSE-4). Readings bill in the database like rent: the consumption of month M
-- is a line on the bill whose period starts in month M+1, a metered bill issues once every meter of its unit has that
-- month's reading (or on its due date), and a reading entered or changed after its bill issued becomes an adjustment
-- line on the next draft of the lease or its renewal. A member writes readings only through save_meter_readings, which
-- re-plans the drafts of the leases they touch in the same transaction.

create table public.meters (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  kind text not null check (kind in ('electricity', 'water')),
  -- [app rule] A flat price per kWh or m³, the way rooming houses bill (DOMAIN-VN §7).
  pricing jsonb not null check (
    jsonb_typeof(pricing) = 'object'
    and pricing ->> 'kind' = 'flat'
    and pricing - array['kind', 'unit_price_vnd'] = '{}'
    and jsonb_typeof(pricing -> 'unit_price_vnd') = 'number'
    and pricing ->> 'unit_price_vnd' ~ '^[1-9][0-9]{0,6}$'
  ),
  serial text check (btrim(serial) <> '' and char_length(serial) <= 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, property_id, unit_id) references public.units (household_id, property_id, id) on delete cascade
);
-- A replaced meter is a new row; the old one stays, inactive, with its readings.
create unique index meters_active_kind_idx on public.meters (unit_id, kind) where active;
create index meters_property_idx on public.meters (household_id, property_id);

create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  meter_id uuid not null,
  -- The first day of the month the reading closes.
  reading_month date not null check (extract(day from reading_month) = 1),
  -- Whole kWh or m³, as the meter shows them.
  reading integer not null check (reading between 0 and 999999999),
  read_on date not null check (read_on >= reading_month),
  photo_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  constraint meter_readings_month_key unique (meter_id, reading_month),
  foreign key (household_id, meter_id) references public.meters (household_id, id) on delete cascade,
  foreign key (household_id, photo_document_id) references public.documents (household_id, id) on delete set null (photo_document_id)
);

-- A meter only counts up, so a reading sits between the readings before and after it, for every writer. [app rule] A
-- month's use stays at or under 100.000 kWh or m³, so its bill line fits invoice_lines' amount at the highest price a
-- meter takes (9.999.999 ₫): a reading typed with extra digits is refused here, never at the nightly run. The meter
-- lock makes two saves of one meter take turns.
create function private.guard_meter_reading()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.meter_id, new.reading_month) is distinct from (old.meter_id, old.reading_month) then
    raise exception 'ESTA_READING_IDENTITY' using errcode = '23514';
  end if;
  perform 1 from public.meters m where m.id = new.meter_id for no key update;
  if exists (select 1 from public.meter_readings r where r.meter_id = new.meter_id and r.reading_month < new.reading_month and r.reading > new.reading) then
    raise exception 'ESTA_READING_BELOW_PREVIOUS' using errcode = '23514';
  end if;
  if exists (select 1 from public.meter_readings r where r.meter_id = new.meter_id and r.reading_month > new.reading_month and r.reading < new.reading) then
    raise exception 'ESTA_READING_ABOVE_NEXT' using errcode = '23514';
  end if;
  if new.reading - coalesce((select max(r.reading) from public.meter_readings r where r.meter_id = new.meter_id and r.reading_month < new.reading_month), new.reading) > 100000
    or coalesce((select min(r.reading) from public.meter_readings r where r.meter_id = new.meter_id and r.reading_month > new.reading_month), new.reading) - new.reading > 100000 then
    raise exception 'ESTA_READING_USE_TOO_LARGE' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meter_reading() from public;

create trigger guard_meter_reading
  before insert or update on public.meter_readings
  for each row execute function private.guard_meter_reading();

select private.enable_household_rls('public.meters', 'member');
select private.enable_audit('public.meters');
select private.enable_household_rls('public.meter_readings', 'member');
select private.enable_audit('public.meter_readings');

-- A meter keeps its unit and kind, so its readings stay one series; a member changes its price, serial or state.
revoke update on table public.meters from authenticated;
grant update (pricing, serial, active) on table public.meters to authenticated;
revoke insert, update, delete on table public.meter_readings from authenticated;
drop policy meter_readings_insert on public.meter_readings;
drop policy meter_readings_update on public.meter_readings;
drop policy meter_readings_delete on public.meter_readings;

-- Each reading with the one before it and the use between them: the one place consumption is worked out, for the bill
-- lines below and for the meter screen.
create view public.meter_usage with (security_invoker = true) as
select
  r.household_id, r.meter_id, r.reading_month, r.reading, r.read_on,
  lag(r.reading_month) over w as previous_month,
  lag(r.reading) over w as previous_reading,
  r.reading - lag(r.reading) over w as used
from public.meter_readings r
window w as (partition by r.meter_id order by r.reading_month);
revoke all on public.meter_usage from anon, authenticated;
grant select on public.meter_usage to authenticated;

-- Each utility line names the meter and the month it bills, so what issued bills charged can be compared with what the
-- readings now say. A line is live until its bill is voided.
alter table public.invoice_lines
  add column meter_id uuid,
  add column reading_month date,
  add column live boolean not null default true,
  add constraint invoice_lines_meter_month check ((meter_id is null) = (reading_month is null)),
  add constraint invoice_lines_meter_kind check (meter_id is null or kind in ('electricity', 'water', 'adjustment')),
  add constraint invoice_lines_meter_fkey foreign key (household_id, meter_id) references public.meters (household_id, id);
create index invoice_lines_meter_idx on public.invoice_lines (meter_id, reading_month) where meter_id is not null;
-- A meter's month has one live electricity or water line in all, on the bill that first charged it; anything charged
-- after that is an adjustment line. A voided bill's line no longer counts, so its month can be charged again.
create unique index invoice_lines_meter_month_once_idx on public.invoice_lines (meter_id, reading_month)
  where live and kind in ('electricity', 'water');

-- A voided bill's lines stop being live, for every path that voids a bill. It runs as its owner, since
-- freeze_issued_lines refuses API roles any change to an issued bill's lines.
create function private.retire_void_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invoice_lines l set live = false where l.invoice_id = new.id and l.live;
  return null;
end;
$$;
revoke all on function private.retire_void_lines() from public;

create trigger retire_void_lines
  after update of status on public.invoices
  for each row when (new.status = 'void' and old.status <> 'void')
  execute function private.retire_void_lines();

-- `1.234`, as a receipt prints a count.
create function private.grouped(p_count numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(p_count, 'FM999,999,999,990'), ',', '.');
$$;
revoke all on function private.grouped(numeric) from public;

-- The last day of the month that starts on p_month, a first of the month: the day the month's reading closes it.
create function private.month_end(p_month date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_month + interval '1 month' - interval '1 day')::date;
$$;
revoke all on function private.month_end(date) from public;

-- A lease and its renewals, both ways along renewal_of_lease_id: one tenant's stay in a room, whose meter months bill
-- as one (LSE-4).
create function private.lease_chain(p_lease_id uuid)
returns table (lease_id uuid)
language sql
stable
rows 3
set search_path = ''
as $$
  with recursive up (id, renewal_of) as (
    select l.id, l.renewal_of_lease_id from public.leases l where l.id = p_lease_id
    union
    select l.id, l.renewal_of_lease_id from public.leases l join up on l.id = up.renewal_of
  ),
  down (id) as (
    select up.id from up
    union
    select l.id from public.leases l join down on l.renewal_of_lease_id = down.id where l.status <> 'draft'
  )
  select down.id from down;
$$;
revoke all on function private.lease_chain(uuid) from public;

-- The lease that holds a room on a day: of the leases past draft whose dates cover it, the one that started last.
create function private.room_holder(p_unit_id uuid, p_day date)
returns uuid
language sql
stable
set search_path = ''
as $$
  select l.id from public.leases l
  where l.unit_id = p_unit_id and l.status <> 'draft' and l.start_date <= p_day and (l.end_date is null or l.end_date >= p_day)
  order by l.start_date desc, l.id
  limit 1;
$$;
revoke all on function private.room_holder(uuid, date) from public;

-- Whose a meter's month is (LSE-4). [app rule] It is the lease chain's that holds the room on the month's last day, so a
-- new tenant pays the whole month they moved in during and never a month that ended before their lease began, and a
-- vacant month is no one's. A month a bill already charged (charged), even a bill voided since, stays with that bill's
-- lease, so ending a lease early or letting the room again never moves it to another tenant.
create function private.meter_month_owner(p_meter_id uuid, p_month date)
returns table (lease_id uuid, charged boolean)
language sql
stable
rows 1
set search_path = ''
as $$
  select coalesce(c.lease_id, private.room_holder(m.unit_id, private.month_end(p_month))), c.lease_id is not null
  from public.meters m
  left join lateral (
    select i.lease_id from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
    where l.meter_id = m.id and l.reading_month = p_month and l.kind in ('electricity', 'water') and i.status <> 'draft'
    order by i.status = 'void', i.period_start
    limit 1
  ) c on true
  where m.id = p_meter_id;
$$;
revoke all on function private.meter_month_owner(uuid, date) from public;

-- The utility lines the lease's drafts should carry (LSE-4). A meter's month goes to its owner's chain
-- (private.meter_month_owner), on the chain's first bill that is not void and starts after the month, whichever lease of
-- the chain issued it: a renewal's first bill carries a month its predecessor had no bill left for. The chain's first
-- bill reaches back only as many months as its period is long. A draft bills the month's use from meter_usage, less what
-- any issued bill already charged for it. For a month a bill already charged, or whose bill went out without it, the
-- difference goes on the chain's earliest draft as an adjustment. A month no bill of its chain will reach is billed to no
-- one; save_meter_readings counts it.
create function private.meter_lines(p_lease public.leases)
returns table (
  invoice_id uuid, kind text, meter_id uuid, reading_month date, quantity integer, unit_price_vnd bigint, amount_vnd bigint,
  description text, sort_order integer
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
  ),
  owed as (
    select
      b.id, b.lease_id, not w.charged and b.status = 'draft' as drafted, u.reading_month as month, u.meter_id, m.kind,
      (m.pricing ->> 'unit_price_vnd')::bigint as price, u.previous_reading as previous, u.reading, coalesce(u.used, 0) as due,
      coalesce((
        select sum(case when l.unit_price_vnd < 0 then -l.quantity else l.quantity end)
        from public.invoice_lines l
        join public.invoices i on i.id = l.invoice_id
        where i.status = 'issued' and l.meter_id = u.meter_id and l.reading_month = u.reading_month
      ), 0)::integer as billed
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
      and u.reading_month >= (select r.month from reach r)
  ),
  next_draft as (
    select b.id, b.lease_id from bills b where b.status = 'draft' order by b.period_start limit 1
  )
  select
    o.id, o.kind, o.meter_id, o.month, o.due - o.billed, o.price, (o.due - o.billed) * o.price,
    format('Tiền %s tháng %s: %s %s (%s → %s)', case o.kind when 'electricity' then 'điện' else 'nước' end, to_char(o.month, 'MM/YYYY'),
      private.grouped(o.due - o.billed), case o.kind when 'electricity' then 'kWh' else 'm³' end, private.grouped(o.previous), private.grouped(o.reading)),
    case o.kind when 'electricity' then 1 else 2 end
  from owed o
  where o.drafted and o.lease_id = p_lease.id and o.due > o.billed
  union all
  select
    d.id, 'adjustment', o.meter_id, o.month, abs(o.due - o.billed), case when o.due > o.billed then o.price else -o.price end, (o.due - o.billed) * o.price,
    format('Điều chỉnh tiền %s tháng %s: %s%s %s', case o.kind when 'electricity' then 'điện' else 'nước' end, to_char(o.month, 'MM/YYYY'),
      case when o.due > o.billed then '+' else '-' end, private.grouped(abs(o.due - o.billed)), case o.kind when 'electricity' then 'kWh' else 'm³' end),
    3
  from owed o
  cross join next_draft d
  where not o.drafted and d.lease_id = p_lease.id and o.due <> o.billed;
$$;
revoke all on function private.meter_lines(public.leases) from public;

-- Brings the drafts' utility lines to meter_lines, touching only lines that differ, so a nightly run that changes
-- nothing writes nothing. Stale lines go first, so a month's line can move to another draft under the one-line index.
create function private.refresh_meter_lines(p_lease public.leases)
returns void
language sql
set search_path = ''
as $$
  with wanted as materialized (
    select * from private.meter_lines(p_lease)
  )
  delete from public.invoice_lines l
  using public.invoices i
  where i.id = l.invoice_id and i.lease_id = p_lease.id and i.status = 'draft' and l.meter_id is not null
    and not exists (
      select 1 from wanted w
      where (w.invoice_id, w.kind, w.meter_id, w.reading_month, w.quantity, w.unit_price_vnd, w.amount_vnd, w.description, w.sort_order)
        = (l.invoice_id, l.kind, l.meter_id, l.reading_month, l.quantity, l.unit_price_vnd, l.amount_vnd, l.description, l.sort_order)
    );
  insert into public.invoice_lines (household_id, invoice_id, kind, meter_id, reading_month, quantity, unit_price_vnd, amount_vnd, description, sort_order)
  select p_lease.household_id, w.invoice_id, w.kind, w.meter_id, w.reading_month, w.quantity, w.unit_price_vnd, w.amount_vnd, w.description, w.sort_order
  from private.meter_lines(p_lease) w
  where not exists (
    select 1 from public.invoice_lines l
    where (w.invoice_id, w.kind, w.meter_id, w.reading_month, w.quantity, w.unit_price_vnd, w.amount_vnd, w.description, w.sort_order)
      = (l.invoice_id, l.kind, l.meter_id, l.reading_month, l.quantity, l.unit_price_vnd, l.amount_vnd, l.description, l.sort_order)
  );
$$;
revoke all on function private.refresh_meter_lines(public.leases) from public;

-- SPEC §5.4's trigger for a metered bill: every active meter of the unit has the reading of the month before its period
-- starts, and that month is this bill's: it belongs to the lease's chain and no earlier bill of the chain that is not
-- void starts after it. Any other bill (a unit with no meter, a month another tenant's, a month an earlier bill took)
-- waits for its due date.
create function private.readings_complete(p_lease public.leases, p_period_start date)
returns boolean
language sql
stable
set search_path = ''
as $$
  with closing as (
    select (date_trunc('month', p_period_start)::date - interval '1 month')::date as start
  ),
  chain as (
    select c.lease_id from private.lease_chain(p_lease.id) c
  )
  select exists (select 1 from public.meters m where m.unit_id = p_lease.unit_id and m.active)
    and not exists (
      select 1 from public.meters m
      cross join lateral private.meter_month_owner(m.id, (select start from closing)) w
      where m.unit_id = p_lease.unit_id and m.active and (
        not exists (select 1 from public.meter_readings r where r.meter_id = m.id and r.reading_month = (select start from closing))
        or w.lease_id is null
        or w.lease_id not in (select c.lease_id from chain c)
      )
    )
    and not exists (
      select 1 from public.invoices j
      where j.lease_id in (select c.lease_id from chain c) and j.status <> 'void'
        and j.period_start < p_period_start and j.period_start > private.month_end((select start from closing))
    );
$$;
revoke all on function private.readings_complete(public.leases, date) from public;

-- The 20261007306700 issuance with metered utilities: an owner-metered lease's drafts carry its utility lines, and a
-- draft issues once its readings are complete, on that day, when that comes before its due date.
create or replace function private.issue_invoices(p_lease_id uuid, p_as_of date, p_issued_at timestamptz, out drafted integer, out issued integer)
language plpgsql
set search_path = ''
as $$
declare
  v_lease public.leases;
  v_plan record;
  v_id uuid;
  v_constraint text;
  v_metered boolean;
begin
  drafted := 0;
  select * into v_lease from public.leases l where l.id = p_lease_id for no key update;
  if v_lease.status is null or v_lease.status not in ('active', 'ended', 'terminated') then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  -- A unit with no reading yet has no utility line to carry, which spares the nightly run on most rooms.
  v_metered := v_lease.utilities_mode = 'metered_by_owner'
    and exists (select 1 from public.meters m join public.meter_readings r on r.meter_id = m.id where m.unit_id = v_lease.unit_id);
  if v_lease.status in ('active', 'terminated') then
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
  if v_metered then
    perform private.refresh_meter_lines(v_lease);
  end if;
  update public.invoices i set status = 'issued', issued_at = p_issued_at, issue_on = least(i.issue_on, p_as_of)
  where i.lease_id = p_lease_id and i.status = 'draft'
    and (i.issue_on <= p_as_of or (v_metered and private.readings_complete(v_lease, i.period_start)))
    and (v_lease.status = 'active'
      or (i.period_start <= v_lease.end_date and (v_lease.status = 'terminated' or v_lease.end_date < p_as_of)));
  get diagnostics issued = row_count;
end;
$$;

-- `Lưu` on the meter screen: one month's readings for meters of one property, read on the database clock's date, then
-- every owner-metered lease on those meters' units re-planned and issued as the nightly job would. A reading equal to
-- the stored one changes nothing, so its read date stays.
create function public.save_meter_readings(p_property_id uuid, p_reading_month date, p_readings jsonb)
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

  issued := 0;
  for v_lease in
    select l.id from public.leases l
    where l.unit_id = any (v_units) and l.utilities_mode = 'metered_by_owner' and (
      l.status = 'active'
      or (l.status = 'terminated' and l.end_date >= v_today)
      or (l.status in ('ended', 'terminated') and exists (select 1 from public.invoices i where i.lease_id = l.id and i.status = 'draft'))
    )
    order by l.id
  loop
    select * into v_done from private.issue_invoices(v_lease, v_today, v_now);
    issued := issued + v_done.issued;
  end loop;

  -- [app rule] A month whose chain has no bill left to carry it (the last month of a lease not renewed, or a reading
  -- entered after the chain's last bill) is billed to no one, never to another tenant. The screen says how many, so Mẹ
  -- can renew the lease, collect them herself or deduct them from the deposit.
  with owned as materialized (
    select w.lease_id
    from jsonb_array_elements(p_readings) e
    join public.meter_usage u on u.meter_id = (e ->> 'meter_id')::uuid and u.reading_month = p_reading_month and u.used > 0
    cross join lateral private.meter_month_owner(u.meter_id, u.reading_month) w
    where u.used <> coalesce((
      select sum(case when il.unit_price_vnd < 0 then -il.quantity else il.quantity end)
      from public.invoice_lines il
      join public.invoices i on i.id = il.invoice_id
      where i.status = 'issued' and il.meter_id = u.meter_id and il.reading_month = u.reading_month
    ), 0)
  )
  select count(*)::integer into unbilled
  from owned w
  join public.leases o on o.id = w.lease_id and o.utilities_mode = 'metered_by_owner'
  where not exists (
    select 1 from private.lease_chain(o.id) c
    join public.leases l on l.id = c.lease_id
    where l.end_date is null
      or exists (
        select 1 from public.invoices i
        where i.lease_id = l.id and i.status = 'draft' and i.period_start > private.month_end(p_reading_month)
      )
      or exists (
        select 1 from private.lease_periods(l, l.end_date) s
        where s.period_start > private.month_end(p_reading_month)
          and s.period_start > coalesce((select max(i.period_start) from public.invoices i where i.lease_id = l.id), l.start_date - 1)
      )
  );
  return next;
end;
$$;
revoke all on function public.save_meter_readings(uuid, date, jsonb) from public, anon;
grant execute on function public.save_meter_readings(uuid, date, jsonb) to authenticated;
