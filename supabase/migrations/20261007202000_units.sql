-- Units and utility accounts (SPEC §5.3, PRP-1). A property has one `whole` unit or one or more other units, never
-- both and never none: the triggers below keep that, so occupancy (P3-07) always has a unit to count.

create table public.units (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  label text not null check (btrim(label) <> '' and char_length(label) <= 80),
  kind text not null check (kind in ('whole', 'room', 'floor', 'shop', 'lot')),
  area_m2 numeric(12, 2) check (area_m2 > 0),
  list_rent_vnd bigint check (list_rent_vnd between 0 and 9007199254740991),
  available_from date,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, property_id, id),
  unique (property_id, label),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade
);
create unique index units_one_whole_idx on public.units (property_id) where kind = 'whole';
create index units_household_property_idx on public.units (household_id, property_id);

create table public.utility_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  unit_id uuid,
  kind text not null check (kind in ('electricity', 'water', 'internet', 'other')),
  provider text check (btrim(provider) <> '' and char_length(provider) <= 120),
  customer_code text check (btrim(customer_code) <> '' and char_length(customer_code) <= 40),
  holder_name text check (btrim(holder_name) <> '' and char_length(holder_name) <= 200),
  note text check (btrim(note) <> '' and char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  foreign key (household_id, property_id, unit_id)
    references public.units (household_id, property_id, id) on delete set null (unit_id)
);
create index utility_accounts_household_property_idx on public.utility_accounts (household_id, property_id);
create index utility_accounts_unit_idx on public.utility_accounts (household_id, property_id, unit_id);

-- The id is derived from the property, so the trigger, the backfill and the seed all name the same row.
create function private.whole_unit_id(p_property_id uuid)
returns uuid
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'esta:unit:whole:' || p_property_id);
$$;
revoke all on function private.whole_unit_id(uuid) from public;
grant execute on function private.whole_unit_id(uuid) to authenticated, service_role;

-- The triggers run as the writer (security invoker), so RLS applies to every row they touch: they can only do what
-- the person who wrote the property or the unit could already do. They are AFTER triggers, so RLS and the foreign keys
-- have already accepted the row before they say anything.
create function private.ensure_whole_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.units (id, household_id, property_id, label, kind)
  values (private.whole_unit_id(new.id), new.household_id, new.id, 'Toàn bộ', 'whole')
  on conflict (id) do nothing;
  return null;
end;
$$;
revoke all on function private.ensure_whole_unit() from public;

create trigger ensure_whole_unit
  after insert on public.properties
  for each row execute function private.ensure_whole_unit();

create function private.keep_whole_unit_exclusive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'whole' then
    if exists (select 1 from public.units u where u.property_id = new.property_id and u.id <> new.id) then
      raise exception 'a whole unit is the only unit of its property' using errcode = '23514';
    end if;
  else
    delete from public.units u
    where u.household_id = new.household_id and u.property_id = new.property_id and u.kind = 'whole';
  end if;
  return null;
end;
$$;
revoke all on function private.keep_whole_unit_exclusive() from public;

create trigger keep_whole_unit_exclusive
  after insert or update of kind, property_id on public.units
  for each row execute function private.keep_whole_unit_exclusive();

-- A household or property delete cascades here after its parent row is gone, so the join finds nothing and no unit
-- comes back for a property that is being removed.
create function private.restore_whole_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.units u where u.property_id = old.property_id)
    and exists (
      select 1 from public.properties p join public.households h on h.id = p.household_id
      where p.id = old.property_id and p.household_id = old.household_id
    ) then
    insert into public.units (id, household_id, property_id, label, kind)
    values (private.whole_unit_id(old.property_id), old.household_id, old.property_id, 'Toàn bộ', 'whole')
    on conflict (id) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function private.restore_whole_unit() from public;

create trigger restore_whole_unit
  after delete or update of property_id on public.units
  for each row execute function private.restore_whole_unit();

-- Only properties with no unit get one, so a rerun adds nothing, including where rooms replaced the whole unit.
create function private.backfill_whole_units()
returns integer
language sql
set search_path = ''
as $$
  with added as (
    insert into public.units (id, household_id, property_id, label, kind)
    select private.whole_unit_id(p.id), p.household_id, p.id, 'Toàn bộ', 'whole'
    from public.properties p
    where not exists (select 1 from public.units u where u.property_id = p.id)
    on conflict (id) do nothing
    returning 1
  )
  select count(*)::integer from added;
$$;
revoke all on function private.backfill_whole_units() from public;

select private.enable_household_rls('public.units', 'member');
select private.enable_audit('public.units');
select private.enable_household_rls('public.utility_accounts', 'member');
select private.enable_audit('public.utility_accounts');

select private.backfill_whole_units();

-- vacant_since takes no date and never calls now(): a unit is available on p_as_of when vacant_since is on or before
-- it, which core decides with the Clock's date. Phase 1 has no leases, so available_from alone marks vacancy.
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
  rent.monthly_rent_vnd,
  rent.vacant_since
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
  select sum(u.list_rent_vnd)::bigint as monthly_rent_vnd, min(u.available_from) as vacant_since
  from public.units u
  where u.household_id = p.household_id and u.property_id = p.id
) rent on true
where p.deleted_at is null;
