-- Leases, invoices and invoice lines (SPEC §5.4, LSE-1 to LSE-3). packages/core/src/lease plans each invoice; this file
-- holds the invariants a bug in any caller must not break: the lease state machine, frozen terms once active, one
-- invoice per lease period, unique numbers and memo codes, and issued invoices that never change.

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  tenant_party_id uuid,
  start_date date,
  end_date date,
  -- Monthly rent (docs/plan/STATUS.md, P3-02). [app rule] The same ceiling as units.list_rent_vnd.
  rent_vnd bigint check (rent_vnd between 0 and 1000000000000),
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
  memo_code text not null check (memo_code ~ '^[A-Z0-9]{8}$'),
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

-- The property lock serializes numbering per property. Memo codes skip I, O, 0 and 1, which read alike on a phone; 32
-- letters keep each byte uniform.
create function private.number_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prefix text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
begin
  if new.status <> 'draft' and current_user = 'authenticated' then
    raise exception 'ESTA_INVOICE_NOT_DRAFT' using errcode = '23514';
  end if;
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
  while new.memo_code is null loop
    v_bytes := extensions.gen_random_bytes(8);
    new.memo_code := (
      select string_agg(substr(v_alphabet, get_byte(v_bytes, n) % 32 + 1, 1), '' order by n) from generate_series(0, 7) as n
    );
    if exists (select 1 from public.invoices i where i.household_id = new.household_id and i.memo_code = new.memo_code) then
      new.memo_code := null;
    end if;
  end loop;
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

-- Only drafts can be deleted or written by a member; an active lease ends through its state machine, and an issued
-- invoice only through a void (P3-11).
drop policy leases_delete on public.leases;
create policy leases_delete on public.leases for delete to authenticated
  using (status = 'draft' and private.is_member(household_id, 'member'));
drop policy invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated
  using (status = 'draft' and private.is_member(household_id, 'member'))
  with check (private.is_member(household_id, 'member'));
drop policy invoices_delete on public.invoices;
create policy invoices_delete on public.invoices for delete to authenticated
  using (status = 'draft' and private.is_member(household_id, 'member'));

-- Generation and issuance for one active lease (SPEC §5.4). `p_invoices` is packages/core planInvoices as JSON:
-- [{period_start, period_end, due_date, issue_on, lines: [{kind, description, quantity, unit_price_vnd, amount_vnd}]}].
-- A period that already has an invoice is skipped with its lines, so a rerun inserts nothing; then every draft whose
-- issue_on has come issues. Runs as the caller, so RLS decides who may write. Returns the lease's invoices.
create function public.write_invoices(p_lease_id uuid, p_invoices jsonb, p_as_of date, p_issued_at timestamptz)
returns table (id uuid, period_start date, due_date date, status text, created boolean)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_lease public.leases;
  v_item jsonb;
  v_id uuid;
  v_created uuid[] := '{}';
begin
  select * into v_lease from public.leases l where l.id = p_lease_id for no key update;
  if not found then
    raise exception 'ESTA_LEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_lease.status <> 'active' then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  for v_item in select value from jsonb_array_elements(p_invoices) loop
    insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
    values (v_lease.household_id, v_lease.id, (v_item ->> 'period_start')::date, (v_item ->> 'period_end')::date,
            (v_item ->> 'due_date')::date, (v_item ->> 'issue_on')::date)
    on conflict on constraint invoices_lease_id_period_start_key do nothing
    returning invoices.id into v_id;
    if v_id is not null then
      v_created := v_created || v_id;
      insert into public.invoice_lines (household_id, invoice_id, kind, description, quantity, unit_price_vnd, amount_vnd, sort_order)
      select v_lease.household_id, v_id, line ->> 'kind', line ->> 'description', (line ->> 'quantity')::numeric,
             (line ->> 'unit_price_vnd')::bigint, (line ->> 'amount_vnd')::bigint, (ordinality - 1)::integer
      from jsonb_array_elements(v_item -> 'lines') with ordinality as x(line, ordinality);
    end if;
    v_id := null;
  end loop;
  update public.invoices i set status = 'issued', issued_at = p_issued_at
  where i.lease_id = p_lease_id and i.status = 'draft' and i.issue_on <= p_as_of;
  return query
    select i.id, i.period_start, i.due_date, i.status, i.id = any (v_created)
    from public.invoices i
    where i.lease_id = p_lease_id
    order by i.period_start;
end;
$$;
revoke all on function public.write_invoices(uuid, jsonb, date, timestamptz) from public, anon;
grant execute on function public.write_invoices(uuid, jsonb, date, timestamptz) to authenticated, service_role;

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
