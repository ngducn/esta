-- Leases, invoices and invoice lines (SPEC §5.4, LSE-1 to LSE-3). This file holds the invariants a bug in any caller
-- must not break: the lease state machine, frozen terms once active, one invoice per stretch of a lease, unique numbers
-- and memo codes, and issued invoices that never change. Members write invoices only through activate_lease, which
-- plans them here from the lease on the database clock, so no caller chooses amounts, periods or issue times.

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  tenant_party_id uuid,
  start_date date,
  end_date date,
  -- Monthly rent (docs/plan/STATUS.md, P3-02). [app rule] The same ceiling as units.list_rent_vnd.
  rent_vnd bigint check (rent_vnd between 1 and 1000000000000),
  billing_cycle_months smallint not null default 1 check (billing_cycle_months in (1, 3, 6, 12)),
  period_anchor text not null default 'calendar_month' check (period_anchor in ('lease_start', 'calendar_month')),
  first_period_proration text not null default 'by_days' check (first_period_proration in ('none', 'by_days')),
  due_offset_days smallint not null default 0 check (due_offset_days between 0 and 31),
  deposit_vnd bigint check (deposit_vnd between 0 and 1000000000000),
  escalation jsonb not null default '{"kind": "none"}' check (
    jsonb_typeof(escalation) = 'object' and escalation ->> 'kind' in ('none', 'percent', 'fixed')
  ),
  utilities_mode text not null default 'tenant_direct' check (utilities_mode in ('tenant_direct', 'metered_by_owner', 'included')),
  tax_payer text not null default 'owner' check (tax_payer in ('owner', 'tenant_withholds')),
  declaring_party_id uuid,
  notice_days smallint check (notice_days between 0 and 365),
  paid_through_date date,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended', 'terminated')),
  terminated_on date,
  termination_reason text check (btrim(termination_reason) <> '' and char_length(termination_reason) <= 1000),
  renewal_of_lease_id uuid,
  notes text check (btrim(notes) <> '' and char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (paid_through_date is null or start_date is null or paid_through_date >= start_date),
  check (status = 'draft' or (tenant_party_id is not null and start_date is not null and rent_vnd is not null)),
  check ((status = 'terminated') = (terminated_on is not null)),
  -- A unit delete is refused while it has leases (private.refuse_leased_unit_delete); the cascade only runs when the
  -- property or household itself is removed.
  foreign key (household_id, property_id, unit_id) references public.units (household_id, property_id, id) on delete cascade,
  foreign key (household_id, tenant_party_id) references public.parties (household_id, id),
  foreign key (household_id, declaring_party_id) references public.parties (household_id, id) on delete set null (declaring_party_id),
  foreign key (household_id, renewal_of_lease_id) references public.leases (household_id, id) on delete set null (renewal_of_lease_id)
);
create index leases_household_property_idx on public.leases (household_id, property_id);
create index leases_unit_idx on public.leases (unit_id, status);
create index leases_tenant_idx on public.leases (household_id, tenant_party_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  lease_id uuid not null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  due_date date not null,
  -- The day the draft issues, from packages/core planInvoices; P3-14 moves it earlier when meter readings complete.
  issue_on date not null,
  number text not null check (number ~ '^[A-Z0-9]{1,12}-[0-9]{6}-[0-9]{3,}$'),
  -- 31 characters: no 0, O, 1, I or L, which read alike on a phone.
  memo_code text not null check (memo_code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  status text not null default 'draft' check (status in ('draft', 'issued', 'void')),
  issued_at timestamptz,
  voided_reason text check (btrim(voided_reason) <> '' and char_length(voided_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (lease_id, period_start),
  unique (household_id, number),
  unique (household_id, memo_code),
  check ((status = 'draft') = (issued_at is null)),
  check ((status = 'void') = (voided_reason is not null)),
  foreign key (household_id, lease_id) references public.leases (household_id, id) on delete cascade
);
create index invoices_household_due_idx on public.invoices (household_id, due_date);
create index invoices_issue_idx on public.invoices (lease_id, issue_on) where status = 'draft';

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  invoice_id uuid not null,
  kind text not null check (kind in ('rent', 'electricity', 'water', 'recurring_charge', 'adjustment', 'other')),
  description text check (btrim(description) <> '' and char_length(description) <= 300),
  quantity numeric(14, 3) not null default 1 check (quantity > 0),
  unit_price_vnd bigint not null check (unit_price_vnd between -1000000000000 and 1000000000000),
  amount_vnd bigint not null check (amount_vnd between -1000000000000 and 1000000000000),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, invoice_id) references public.invoices (household_id, id) on delete cascade
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, sort_order);

-- LEASE_TRANSITIONS in packages/core/src/lease/state.ts. Once a lease leaves draft its money terms change only through
-- an amendment (P3-08), so these columns freeze; status, termination and notes stay writable.
create function private.guard_lease()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and current_user = 'authenticated' then
      raise exception 'ESTA_LEASE_NOT_DRAFT' using errcode = '23514';
    end if;
    return new;
  end if;
  -- A member activates only through public.activate_lease, which issues the first invoices in the same transaction.
  if old.status = 'draft' and new.status = 'active' and current_user = 'authenticated' then
    raise exception 'ESTA_LEASE_ACTIVATE_THROUGH_FUNCTION' using errcode = '42501';
  end if;
  if new.status <> old.status and not (old.status, new.status) in (('draft', 'active'), ('active', 'ended'), ('active', 'terminated')) then
    raise exception 'ESTA_LEASE_TRANSITION' using errcode = '23514', detail = format('%s to %s', old.status, new.status);
  end if;
  if old.status <> 'draft' and (
    new.property_id, new.unit_id, new.tenant_party_id, new.start_date, new.end_date, new.rent_vnd, new.billing_cycle_months,
    new.period_anchor, new.first_period_proration, new.due_offset_days, new.deposit_vnd, new.escalation, new.utilities_mode,
    new.paid_through_date
  ) is distinct from (
    old.property_id, old.unit_id, old.tenant_party_id, old.start_date, old.end_date, old.rent_vnd, old.billing_cycle_months,
    old.period_anchor, old.first_period_proration, old.due_offset_days, old.deposit_vnd, old.escalation, old.utilities_mode,
    old.paid_through_date
  ) then
    raise exception 'ESTA_LEASE_TERMS_LOCKED' using errcode = '23514';
  end if;
  if old.status = 'draft' and new.status = 'active' then
    -- The unit lock makes two activations on one unit take turns, so neither misses the other's lease.
    perform 1 from public.units u where u.id = new.unit_id for no key update;
    if exists (
      select 1 from public.leases l
      where l.unit_id = new.unit_id and l.id <> new.id and l.status = 'active'
        and daterange(l.start_date, l.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    ) then
      raise exception 'ESTA_LEASE_OVERLAP' using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_lease() from public;

create trigger guard_lease
  before insert or update on public.leases
  for each row execute function private.guard_lease();

create function private.new_memo_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_byte integer;
begin
  while char_length(v_code) < 8 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    -- 248 is 8 × 31; a byte above it would favour the first eight characters.
    if v_byte < 248 then
      v_code := v_code || substr(v_alphabet, v_byte % 31 + 1, 1);
    end if;
  end loop;
  return v_code;
end;
$$;
revoke all on function private.new_memo_code() from public;

-- The property lock serializes numbering per property. A memo code that collides raises a unique violation, which
-- private.issue_invoices retries.
create function private.number_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prefix text;
begin
  if new.number is null then
    select p.code || '-' || to_char(new.period_start, 'YYYYMM') into v_prefix
    from public.leases l join public.properties p on p.id = l.property_id
    where l.id = new.lease_id
    for no key update of p;
    select v_prefix || '-' || lpad((coalesce(max(substring(i.number from char_length(v_prefix) + 2)::integer), 0) + 1)::text, 3, '0')
    into new.number
    from public.invoices i
    where i.household_id = new.household_id and i.number like v_prefix || '-%';
  end if;
  new.memo_code := coalesce(new.memo_code, private.new_memo_code());
  return new;
end;
$$;
revoke all on function private.number_invoice() from public;

create trigger number_invoice
  before insert on public.invoices
  for each row execute function private.number_invoice();

-- Issued invoices are never edited (SPEC §5.4); corrections become an adjustment line on the next invoice.
create function private.freeze_issued_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    raise exception 'ESTA_INVOICE_ISSUED' using errcode = '23514';
  end if;
  if (new.lease_id, new.period_start, new.number, new.memo_code) is distinct from (old.lease_id, old.period_start, old.number, old.memo_code) then
    raise exception 'ESTA_INVOICE_IDENTITY' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.freeze_issued_invoice() from public;

create trigger freeze_issued_invoice
  before update on public.invoices
  for each row execute function private.freeze_issued_invoice();

-- During a household or lease delete the invoice row is already gone, so the cascade passes. Direct database
-- connections (the seed, a backup restore) write issued invoices whole, so the guard covers API roles.
create function private.freeze_issued_lines()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_invoice uuid := case when tg_op = 'INSERT' then new.invoice_id else old.invoice_id end;
begin
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'ESTA_INVOICE_IDENTITY' using errcode = '23514';
  end if;
  if current_user in ('authenticated', 'service_role')
    and exists (select 1 from public.invoices i where i.id = v_invoice and i.status <> 'draft') then
    raise exception 'ESTA_INVOICE_ISSUED' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.freeze_issued_lines() from public;

create trigger freeze_issued_lines
  before insert or update or delete on public.invoice_lines
  for each row execute function private.freeze_issued_lines();

-- A unit with lease history keeps it, and a room arriving on a property whose whole unit has a lease is refused, because
-- keep_whole_unit_exclusive deletes the whole unit. The property row is gone when a property or household delete
-- cascades here.
create function private.refuse_leased_unit_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.leases l where l.unit_id = old.id)
    and exists (select 1 from public.properties p where p.id = old.property_id) then
    raise exception '%', case when old.kind = 'whole' then 'ESTA_WHOLE_UNIT_LEASED' else 'ESTA_UNIT_HAS_LEASES' end using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function private.refuse_leased_unit_delete() from public;

create trigger refuse_leased_unit_delete
  before delete on public.units
  for each row execute function private.refuse_leased_unit_delete();

select private.enable_household_rls('public.leases', 'member');
select private.enable_audit('public.leases');
select private.enable_household_rls('public.invoices', 'member');
select private.enable_audit('public.invoices');
select private.enable_household_rls('public.invoice_lines', 'member');
select private.enable_audit('public.invoice_lines');

-- Only drafts can be deleted by a member; an active lease ends through its state machine. Invoices and their lines
-- change only through the functions below and P3-11's void, never by a direct member write.
drop policy leases_delete on public.leases;
create policy leases_delete on public.leases for delete to authenticated
  using (status = 'draft' and private.is_member(household_id, 'member'));
revoke insert, update, delete on table public.invoices, public.invoice_lines from authenticated;
drop policy invoices_insert on public.invoices;
drop policy invoices_update on public.invoices;
drop policy invoices_delete on public.invoices;
drop policy invoice_lines_insert on public.invoice_lines;
drop policy invoice_lines_update on public.invoice_lines;
drop policy invoice_lines_delete on public.invoice_lines;

-- packages/core/src/schedule/rounding.ts: amount × numerator ÷ denominator, half up to a multiple, in exact integers.
create function private.scale_round_half_up(p_amount numeric, p_numerator numeric, p_denominator numeric, p_multiple numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select div(2 * p_amount * p_numerator + p_denominator * p_multiple, 2 * p_denominator * p_multiple) * p_multiple;
$$;
revoke all on function private.scale_round_half_up(numeric, numeric, numeric, numeric) from public;

-- packages/core/src/schedule/dates.ts monthsUntil: the largest n with p_from + n months on or before p_to.
create function private.months_until(p_from date, p_to date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_from + make_interval(months => n) <= p_to then n else n - 1 end
  from (select ((extract(year from p_to) - extract(year from p_from)) * 12 + extract(month from p_to) - extract(month from p_from))::integer as n) c;
$$;
revoke all on function private.months_until(date, date) from public;

-- The SQL twin of packages/core/src/lease/invoicing.ts planInvoices over generateSchedule, without amendments (P3-08)
-- or meter readings (P3-14): every period ending on or after p_as_of and starting within 35 days of it, less what
-- paid_through_date covers. A paid-through date inside a period bills the days after it at the period's daily rate.
-- leases.integration.test.ts compares the two.
create function private.plan_invoices(p_lease public.leases, p_as_of date)
returns table (period_start date, period_end date, due_date date, issue_on date, rent_vnd bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_horizon date := p_as_of + 35;
  v_last_start date := least(coalesce(p_lease.end_date, v_horizon), v_horizon);
  v_origin date := case when p_lease.period_anchor = 'lease_start' then p_lease.start_date else date_trunc('month', p_lease.start_date)::date end;
  v_cycle integer := p_lease.billing_cycle_months;
  v_kind text := p_lease.escalation ->> 'kind';
  v_every integer := (p_lease.escalation ->> 'every_months')::integer;
  v_step_value numeric := (p_lease.escalation ->> 'value')::numeric;
  v_rounding numeric := coalesce((p_lease.escalation ->> 'rounding_vnd')::numeric, 100000);
  v_paid date := p_lease.paid_through_date;
  v_offset integer := 0;
  v_full_start date := v_origin;
  v_start date := p_lease.start_date;
  v_natural_end date;
  v_end date;
  v_charge_start date;
  v_full_days integer;
  v_days integer;
  v_monthly numeric;
  v_rent numeric;
  v_rate_vnd numeric;
  v_rate_days integer;
begin
  while v_start <= v_last_start loop
    v_natural_end := (v_origin + make_interval(months => v_offset + v_cycle))::date - 1;
    v_end := least(v_natural_end, coalesce(p_lease.end_date, v_natural_end));
    v_charge_start := case when p_lease.first_period_proration = 'none' and v_end = v_natural_end then v_full_start else v_start end;
    v_full_days := v_natural_end - v_full_start + 1;
    v_days := v_end - v_charge_start + 1;
    v_monthly := p_lease.rent_vnd;
    if v_kind <> 'none' then
      for i in 1 .. private.months_until(p_lease.start_date, v_start) / v_every loop
        v_monthly := case v_kind
          when 'percent' then private.scale_round_half_up(v_monthly, 10000 + v_step_value, 10000, v_rounding)
          else private.scale_round_half_up(v_monthly + v_step_value, 1, 1, v_rounding)
        end;
      end loop;
    end if;
    if v_days < v_full_days then
      v_rent := private.scale_round_half_up(v_monthly, v_cycle * v_days, v_full_days, 1);
      v_rate_vnd := v_monthly * v_cycle;
      v_rate_days := v_full_days;
    else
      v_rent := v_monthly * v_cycle;
      v_rate_vnd := v_rent;
      v_rate_days := v_end - v_start + 1;
    end if;
    if v_end >= p_as_of and (v_paid is null or v_paid < v_end) then
      period_start := case when v_paid is null or v_paid < v_start then v_start else v_paid + 1 end;
      period_end := v_end;
      due_date := period_start + p_lease.due_offset_days;
      issue_on := case when p_lease.utilities_mode = 'metered_by_owner' then due_date else period_start end;
      rent_vnd := case when period_start = v_start then v_rent
        else private.scale_round_half_up(v_rate_vnd, v_end - period_start + 1, v_rate_days, 1) end;
      return next;
    end if;
    v_offset := v_offset + v_cycle;
    v_full_start := (v_origin + make_interval(months => v_offset))::date;
    v_start := v_full_start;
  end loop;
end;
$$;
revoke all on function private.plan_invoices(public.leases, date) from public;

-- The business date of the database clock: the test_clock row on a seeded local stack (FND-9), the wall clock elsewhere.
create function private.business_date(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Ho_Chi_Minh')::date;
$$;
revoke all on function private.business_date(timestamptz) from public;

-- Generation and issuance for one active lease (SPEC §5.4). A planned stretch that overlaps any invoice of the lease is
-- skipped, so a rerun inserts nothing; then every draft whose issue_on has come issues at p_issued_at.
create function private.issue_invoices(p_lease_id uuid, p_as_of date, p_issued_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lease public.leases;
  v_plan record;
  v_id uuid;
  v_constraint text;
begin
  select * into v_lease from public.leases l where l.id = p_lease_id for no key update;
  if v_lease.status is distinct from 'active' then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
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
  end loop;
  update public.invoices i set status = 'issued', issued_at = p_issued_at
  where i.lease_id = p_lease_id and i.status = 'draft' and i.issue_on <= p_as_of;
end;
$$;
revoke all on function private.issue_invoices(uuid, date, timestamptz) from public;

-- What activation would bill: the lease's plan with p_paid_through on the database clock's date.
create function public.preview_activation(p_lease_id uuid, p_paid_through date default null)
returns table (period_start date, period_end date, due_date date, rent_vnd bigint, issues_now boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lease public.leases;
  v_today date := private.business_date(private.audit_now());
begin
  select * into v_lease from public.leases l where l.id = p_lease_id and private.is_member(l.household_id, 'member');
  if not found then
    raise exception 'ESTA_LEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_lease.start_date is null or v_lease.rent_vnd is null then
    return;
  end if;
  v_lease.paid_through_date := p_paid_through;
  return query
    select p.period_start, p.period_end, p.due_date, p.rent_vnd, p.issue_on <= v_today
    from private.plan_invoices(v_lease, v_today) p;
end;
$$;
revoke all on function public.preview_activation(uuid, date) from public, anon;
grant execute on function public.preview_activation(uuid, date) to authenticated;

-- LSE-2 and LSE-3 in one transaction: the draft becomes active with its paid-through date, and the invoices it owes on
-- the database clock's date are written and issued. Any failure leaves the lease a draft. guard_lease and the lease
-- checks refuse missing terms, overlaps and every other transition.
create function public.activate_lease(p_lease_id uuid, p_paid_through date default null)
returns table (id uuid, period_start date, period_end date, due_date date, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text;
  v_now timestamptz := private.audit_now();
begin
  select l.status into v_status from public.leases l
  where l.id = p_lease_id and private.is_member(l.household_id, 'member')
  for no key update;
  if not found then
    raise exception 'ESTA_LEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status = 'active' then
    raise exception 'ESTA_LEASE_ALREADY_ACTIVE' using errcode = '55000';
  end if;
  update public.leases l set status = 'active', paid_through_date = p_paid_through where l.id = p_lease_id;
  perform private.issue_invoices(p_lease_id, private.business_date(v_now), v_now);
  return query
    select i.id, i.period_start, i.period_end, i.due_date, i.status from public.invoices i
    where i.lease_id = p_lease_id
    order by i.period_start;
end;
$$;
revoke all on function public.activate_lease(uuid, date) from public, anon;
grant execute on function public.activate_lease(uuid, date) to authenticated;

-- Units under an active lease are not vacant, and a unit whose last lease ended is vacant from the day after it ended
-- (SPEC §5.3), else from available_from. Every Phase 1 column keeps its place.
create or replace view public.property_list_rows with (security_invoker = true) as
select
  p.id,
  p.household_id,
  p.nickname,
  p.code,
  p.kind,
  p.use_mode,
  p.legal_status,
  p.cover_photo_path,
  p.current_address ->> 'line' as address_line,
  commune.name as commune_name,
  p.current_address ->> 'province_code' as province_code,
  province.name as province_name,
  p.certificate_address_text,
  coalesce(legacy.province_names, '{}') as legacy_province_names,
  regexp_replace(public.esta_unaccent(concat_ws(' ',
    p.nickname, p.code, p.current_address ->> 'line', commune.name, province.name,
    p.certificate_address_text, legacy.unit_names)), '[\s,;]+', ' ', 'g') as search_text,
  extensions.st_y(p.location::extensions.geometry) as lat,
  extensions.st_x(p.location::extensions.geometry) as lng,
  p.boundary is not null as has_boundary,
  coalesce(owners.party_ids, '{}') as owner_party_ids,
  rent.monthly_rent_vnd,
  rent.vacant_since,
  rent.leased_unit_count,
  rent.unit_count
from public.properties p
left join public.admin_units commune on commune.code = p.current_address ->> 'commune_code'
left join public.admin_units province on province.code = p.current_address ->> 'province_code'
left join lateral (
  select
    array_agg(distinct m.old_province_name order by m.old_province_name) as province_names,
    string_agg(distinct concat_ws(' ', m.old_commune_name, m.old_district_name, m.old_province_name), ' ') as unit_names
  from public.admin_unit_legacy_map m
  where m.new_commune_code = p.current_address ->> 'commune_code'
) legacy on true
left join lateral (
  select array_agg(o.party_id order by o.party_id) as party_ids
  from public.ownership_shares o
  where o.household_id = p.household_id and o.property_id = p.id
) owners on true
left join lateral (
  select
    sum(u.list_rent_vnd)::bigint as monthly_rent_vnd,
    min(coalesce(lease.ended_on + 1, u.available_from)) filter (where not lease.leased) as vacant_since,
    (count(*) filter (where lease.leased))::integer as leased_unit_count,
    count(*)::integer as unit_count
  from public.units u
  cross join lateral (
    select
      coalesce(bool_or(l.status = 'active'), false) as leased,
      max(coalesce(l.terminated_on, l.end_date)) filter (where l.status in ('ended', 'terminated')) as ended_on
    from public.leases l
    where l.household_id = u.household_id and l.unit_id = u.id
  ) lease
  where u.household_id = p.household_id and u.property_id = p.id
) rent on true
where p.deleted_at is null;
