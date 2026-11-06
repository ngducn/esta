-- Rooms and utility accounts are soft deleted (SPEC §5.3): deleting sets deleted_at and `Hoàn tác` clears it, so an undo
-- is one update on the same row, with its meters, leases and account links untouched. The label of a room that is in the
-- trash can be used again.

alter table public.units add column deleted_at timestamptz;
alter table public.utility_accounts add column deleted_at timestamptz;

alter table public.units drop constraint units_property_id_label_key;
create unique index units_property_label_idx on public.units (property_id, label) where deleted_at is null;
drop index public.units_household_property_idx;
create index units_household_property_idx on public.units (household_id, property_id) where deleted_at is null;

select private.enable_soft_delete('public.units');
select private.enable_soft_delete('public.utility_accounts');

-- With the delete policy gone, the writer's own delete of the whole unit would find no row, so this runs as its owner. A
-- room in the trash leaves the whole unit where it is, and restoring it takes the whole unit away again.
create or replace function private.keep_whole_unit_exclusive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return null;
  end if;
  perform 1 from public.properties p where p.id = new.property_id for no key update;
  if new.kind = 'whole' then
    if exists (select 1 from public.units u where u.property_id = new.property_id and u.id <> new.id and u.deleted_at is null) then
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

drop trigger keep_whole_unit_exclusive on public.units;
create trigger keep_whole_unit_exclusive
  after insert or update of kind, deleted_at on public.units
  for each row execute function private.keep_whole_unit_exclusive();

create or replace function private.restore_whole_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1
  from public.properties p join public.households h on h.id = p.household_id
  where p.id = old.property_id and p.household_id = old.household_id
  for no key update of p;
  if found and not exists (select 1 from public.units u where u.property_id = old.property_id and u.deleted_at is null) then
    insert into public.units (id, household_id, property_id, label, kind)
    values (private.whole_unit_id(old.property_id), old.household_id, old.property_id, 'Toàn bộ', 'whole')
    on conflict (id) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function private.restore_whole_unit() from public;

-- Putting the last room in the trash brings the whole unit back, as deleting it used to.
create function private.trash_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kind = 'whole' then
    raise exception 'the whole unit of a property stays' using errcode = '23514';
  end if;
  if exists (select 1 from public.leases l where l.unit_id = old.id) then
    raise exception 'ESTA_UNIT_HAS_LEASES' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.trash_unit() from public;

create trigger trash_unit
  before update of deleted_at on public.units
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.trash_unit();

create trigger restore_whole_unit_on_trash
  after update of deleted_at on public.units
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.restore_whole_unit();

create function private.refuse_trashed_unit_lease()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.units u where u.id = new.unit_id and u.deleted_at is not null) then
    raise exception 'ESTA_UNIT_DELETED' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_trashed_unit_lease() from public;

create trigger refuse_trashed_unit_lease
  before insert or update of unit_id on public.leases
  for each row execute function private.refuse_trashed_unit_lease();

-- Adds rooms in one statement under the property's lock, so two adds at once take turns and number their rooms after each
-- other. A label the property already has is skipped, so a second tap adds nothing.
create function public.add_rooms(p_property_id uuid, p_labels text[], p_list_rent_vnd bigint default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_first integer;
  v_added integer;
begin
  select p.household_id into v_household from public.properties p
  where p.id = p_property_id and p.deleted_at is null and private.is_member(p.household_id, 'member')
  for no key update of p;
  if not found then
    raise exception 'ESTA_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('add_rooms:' || p_property_id, 0));
  select coalesce(max(u.sort_order), -1) + 1 into v_first from public.units u where u.property_id = p_property_id and u.deleted_at is null;
  with added as (
    insert into public.units (household_id, property_id, label, kind, list_rent_vnd, sort_order)
    select v_household, p_property_id, l.label, 'room', p_list_rent_vnd, v_first + l.ord::integer - 1
    from unnest(p_labels) with ordinality as l (label, ord)
    on conflict (property_id, label) where deleted_at is null do nothing
    returning 1
  )
  select count(*)::integer into v_added from added;
  return v_added;
end;
$$;
revoke all on function public.add_rooms(uuid, text[], bigint) from public, anon;
grant execute on function public.add_rooms(uuid, text[], bigint) to authenticated;

-- Sets the sort order of several rooms together: all of them, or none when one is gone or belongs to another property.
create function public.reorder_units(p_property_id uuid, p_changes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  perform 1 from public.properties p
  where p.id = p_property_id and p.deleted_at is null and private.is_member(p.household_id, 'member')
  for no key update of p;
  if not found then
    raise exception 'ESTA_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  with changes as (select x.id, x.sort_order from jsonb_to_recordset(p_changes) as x (id uuid, sort_order integer)),
  moved as (
    update public.units u set sort_order = c.sort_order
    from changes c
    where u.id = c.id and u.property_id = p_property_id and u.deleted_at is null
    returning 1
  )
  select count(*)::integer into v_updated from moved;
  if v_updated <> jsonb_array_length(p_changes) then
    raise exception 'ESTA_UNITS_CHANGED' using errcode = 'P0002';
  end if;
  return v_updated;
end;
$$;
revoke all on function public.reorder_units(uuid, jsonb) from public, anon;
grant execute on function public.reorder_units(uuid, jsonb) to authenticated;

-- A room in the trash is not counted in the list's rent, vacancy or unit counts.
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
  where u.household_id = p.household_id and u.property_id = p.id and u.deleted_at is null
) rent on true
where p.deleted_at is null;
