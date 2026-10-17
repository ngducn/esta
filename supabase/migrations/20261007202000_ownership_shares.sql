-- Ownership shares (SPEC §5.3, PRP-3). Nothing sums the shares: an incomplete set saves and the app warns.
create table public.ownership_shares (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  party_id uuid not null,
  share_bp integer not null check (share_bp between 1 and 10000),
  named_on_certificate boolean not null default false,
  since date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (property_id, party_id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  -- No cascade from parties: removing a person must not silently drop what they own.
  foreign key (household_id, party_id) references public.parties (household_id, id)
);
create index ownership_shares_household_property_idx on public.ownership_shares (household_id, property_id);
create index ownership_shares_household_party_idx on public.ownership_shares (household_id, party_id);

select private.enable_household_rls('public.ownership_shares', 'member');
select private.enable_audit('public.ownership_shares');

create function private.valid_ownership_shares(p_shares jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when coalesce(jsonb_typeof(p_shares), '') <> 'array' or jsonb_array_length(p_shares) > 20 then false else
    not exists (
      select 1
      from jsonb_array_elements(p_shares) as s (item)
      where not (
        jsonb_typeof(s.item) = 'object'
        and not exists (
          select 1 from jsonb_object_keys(s.item) as k (key)
          where k.key not in ('party_id', 'share_bp', 'named_on_certificate', 'since'))
        and jsonb_typeof(s.item -> 'party_id') = 'string'
        and pg_catalog.pg_input_is_valid(s.item ->> 'party_id', 'uuid')
        and jsonb_typeof(s.item -> 'share_bp') = 'number'
        and pg_catalog.pg_input_is_valid(s.item ->> 'share_bp', 'integer')
        and jsonb_typeof(s.item -> 'named_on_certificate') = 'boolean'
        and (s.item -> 'since' is null or s.item -> 'since' = 'null' or private.valid_iso_date(s.item -> 'since'))
      )
    )
    and (
      select count(distinct case when jsonb_typeof(s.item) = 'object' and pg_catalog.pg_input_is_valid(s.item ->> 'party_id', 'uuid')
        then (s.item ->> 'party_id')::uuid end) = count(*)
      from jsonb_array_elements(p_shares) as s (item))
  end;
$$;
revoke all on function private.valid_ownership_shares(jsonb) from public;
grant execute on function private.valid_ownership_shares(jsonb) to authenticated, service_role;

-- Security invoker, so RLS answers every read and write: a property outside the caller's households is not found
-- whether or not it exists, and a viewer is refused by the insert and delete policies.
create function public.set_ownership_shares(p_property_id uuid, p_shares jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select p.household_id into v_household_id
  from public.properties p
  where p.id = p_property_id and p.deleted_at is null;
  if v_household_id is null then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  if not private.is_member(v_household_id, 'member') then
    raise exception 'only a member can change ownership' using errcode = '42501';
  end if;
  if not private.valid_ownership_shares(p_shares) then
    raise exception 'shares must be an array of distinct parties with share_bp, named_on_certificate and since'
      using errcode = '22023';
  end if;
  -- Two saves of the same property run one after the other, so neither keeps a party the other removed.
  perform 1 from public.properties p where p.id = p_property_id for no key update;

  delete from public.ownership_shares o
  where o.property_id = p_property_id
    and o.party_id not in (select (s.item ->> 'party_id')::uuid from jsonb_array_elements(p_shares) as s (item));

  insert into public.ownership_shares as o (household_id, property_id, party_id, share_bp, named_on_certificate, since)
  select v_household_id, p_property_id, (s.item ->> 'party_id')::uuid, (s.item ->> 'share_bp')::integer,
    (s.item ->> 'named_on_certificate')::boolean, (s.item ->> 'since')::date
  from jsonb_array_elements(p_shares) as s (item)
  on conflict (property_id, party_id) do update
  set share_bp = excluded.share_bp, named_on_certificate = excluded.named_on_certificate, since = excluded.since
  where (o.share_bp, o.named_on_certificate, o.since)
    is distinct from (excluded.share_bp, excluded.named_on_certificate, excluded.since);
end;
$$;
revoke all on function public.set_ownership_shares(uuid, jsonb) from public, anon;
grant execute on function public.set_ownership_shares(uuid, jsonb) to authenticated;

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
  coalesce(owners.party_ids, '{}') as owner_party_ids
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
where p.deleted_at is null;
