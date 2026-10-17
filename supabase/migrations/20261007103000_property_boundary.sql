alter table public.properties add column boundary extensions.geometry(polygon, 4326);

alter table public.properties add constraint properties_boundary_valid check (
  boundary is null or (extensions.st_isvalid(boundary) and extensions.st_issimple(boundary))
);

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
  p.boundary is not null as has_boundary
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
where p.deleted_at is null;

-- Security invoker, so RLS decides: a viewer or another household updates no row and gets no_data_found.
-- Each returns the value it replaced, so the caller's undo writes exactly that back.
create function public.set_property_location(p_property_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_found boolean;
  v_previous jsonb;
begin
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'latitude and longitude are set or cleared together' using errcode = '22023';
  end if;
  select true, case when p.location is null then null else jsonb_build_object(
      'lat', extensions.st_y(p.location::extensions.geometry),
      'lng', extensions.st_x(p.location::extensions.geometry)) end
    into v_found, v_previous
  from public.properties p
  where p.id = p_property_id and p.deleted_at is null
  for update;
  update public.properties
  set location = case when p_lat is null then null
    else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end
  where id = p_property_id and deleted_at is null and v_found;
  if not found then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  return v_previous;
end;
$$;

create function public.set_property_boundary(p_property_id uuid, p_boundary jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_found boolean;
  v_previous jsonb;
begin
  select true, extensions.st_asgeojson(p.boundary)::jsonb
    into v_found, v_previous
  from public.properties p
  where p.id = p_property_id and p.deleted_at is null
  for update;
  update public.properties
  set boundary = case when p_boundary is null then null
    else extensions.st_setsrid(extensions.st_geomfromgeojson(p_boundary::text), 4326) end
  where id = p_property_id and deleted_at is null and v_found;
  if not found then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  return v_previous;
end;
$$;

create function public.property_boundary(p_property_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select extensions.st_asgeojson(p.boundary)::jsonb
  from public.properties p
  where p.id = p_property_id and p.deleted_at is null
$$;

revoke all on function public.set_property_location(uuid, double precision, double precision) from public, anon;
revoke all on function public.set_property_boundary(uuid, jsonb) from public, anon;
revoke all on function public.property_boundary(uuid) from public, anon;
grant execute on function public.set_property_location(uuid, double precision, double precision) to authenticated;
grant execute on function public.set_property_boundary(uuid, jsonb) to authenticated;
grant execute on function public.property_boundary(uuid) to authenticated;
