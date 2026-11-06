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
declare
  v_trashed timestamptz;
begin
  -- The same lock the activation trigger takes (never FOR SHARE, which two sessions could not upgrade). It conflicts with
  -- the trashing UPDATE, so a lease and the trashing of its room take turns.
  select u.deleted_at into v_trashed from public.units u where u.id = new.unit_id for no key update;
  if v_trashed is not null then
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

-- Undoing a batch removes the rooms and accounts it created outright: they are part of the batch's property, which is the row archived.
create or replace function public.undo_change_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.change_batches;
  v_blockers jsonb;
  v_archived jsonb := '[]';
  v_now timestamptz := private.audit_now();
  v_row record;
begin
  select * into v_batch from public.change_batches b where b.id = p_batch_id for update;
  if not found or not (private.is_member(v_batch.household_id, 'admin') and private.is_operator(v_batch.household_id)) then
    raise exception 'ESTA_BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_batch.status not in ('applied', 'partial') then
    raise exception 'ESTA_BATCH_NOT_UNDOABLE' using errcode = '55000', detail = v_batch.status;
  end if;

  perform private.lock_batch_rows(p_batch_id);
  perform private.lock_ledger_parents(p_batch_id);
  select coalesce(jsonb_agg(distinct to_jsonb(b)), '[]') into v_blockers from private.undo_blockers(p_batch_id) b;
  if v_blockers <> '[]' then
    return jsonb_build_object('undone', false, 'blockers', v_blockers);
  end if;

  perform set_config('esta.via', 'undo', true);
  perform set_config('esta.batch', p_batch_id::text, true);
  for v_row in select * from private.batch_rows(p_batch_id) t where not t.created and not t.removed order by t.last_id desc loop
    perform private.undo_restore(v_row.table_name, v_row.row_id, v_row.before_image);
  end loop;
  for v_row in select * from private.batch_rows(p_batch_id) t where t.created and not t.removed order by t.first_id desc loop
    if v_row.table_name not in ('units', 'utility_accounts') and exists (
      select from pg_catalog.pg_attribute a
      where a.attrelid = format('public.%I', v_row.table_name)::regclass and a.attname = 'deleted_at' and not a.attisdropped
    ) then
      execute format('update public.%I set deleted_at = $2 where id = $1 and deleted_at is null', v_row.table_name) using v_row.row_id, v_now;
      v_archived := v_archived || jsonb_build_object('table_name', v_row.table_name, 'row_id', v_row.row_id);
    else
      execute format('delete from public.%I where id = $1', v_row.table_name) using v_row.row_id;
    end if;
  end loop;
  for v_row in select * from private.batch_rows(p_batch_id) t where not t.created and t.removed order by t.last_id desc loop
    perform private.undo_restore(v_row.table_name, v_row.row_id, v_row.before_image);
  end loop;
  update public.change_batches set status = 'undone', undone_at = v_now where id = p_batch_id;
  perform set_config('esta.via', '', true);
  perform set_config('esta.batch', '', true);
  return jsonb_build_object('undone', true, 'archived', v_archived);
end;
$$;

-- A trashed utility account no longer counts toward "has a utility account" (it did while the delete was hard).
create or replace view public.property_completeness_facts with (security_invoker = true) as
select
  p.id as property_id,
  p.household_id,
  p.kind,
  coalesce(p.current_address ->> 'commune_code', '') <> ''
    and coalesce(btrim(p.current_address ->> 'street'), '') <> '' as has_current_address,
  p.location is not null as has_location,
  p.acquired_on is not null and p.acquisition_kind is not null as has_acquisition,
  coalesce(parcel.total, 0)::integer as parcel_count,
  parcel.without_number_id as parcel_without_number_id,
  parcel.without_area_id as parcel_without_area_id,
  coalesce(structure.total, 0)::integer as structure_count,
  structure.without_floor_area_id as structure_without_floor_area_id,
  coalesce(share.total_bp, 0)::integer as share_total_bp,
  coalesce(account.total, 0)::integer as utility_account_count,
  coalesce(document.certificates, 0)::integer as certificate_document_count,
  (coalesce(document.photos, 0) + (p.cover_photo_path is not null)::integer)::integer as photo_count
from public.properties p
left join lateral (
  select
    count(*) as total,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.parcel_no is null or x.map_sheet_no is null))[1] as without_number_id,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.area_m2 is null))[1] as without_area_id
  from public.parcels x
  where x.household_id = p.household_id and x.property_id = p.id
) parcel on true
left join lateral (
  select
    count(*) as total,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.floor_area_m2 is null))[1] as without_floor_area_id
  from public.structures x
  where x.household_id = p.household_id and x.property_id = p.id
) structure on true
left join lateral (
  select sum(x.share_bp) as total_bp
  from public.ownership_shares x
  where x.household_id = p.household_id and x.property_id = p.id
) share on true
left join lateral (
  select count(*) as total
  from public.utility_accounts x
  where x.household_id = p.household_id and x.property_id = p.id and x.deleted_at is null
) account on true
left join lateral (
  select
    count(*) filter (where x.category = 'certificate') as certificates,
    count(*) filter (where x.category = 'photo') as photos
  from public.documents x
  where x.household_id = p.household_id and x.property_id = p.id and x.deleted_at is null
) document on true
where p.deleted_at is null;
