-- A direct UPDATE of location would store a wrapped point (longitude 407 lands as 47), so pins and
-- boundaries are written only through the functions below, which run as their owner and check membership.
revoke update on table public.properties from authenticated;
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'properties' and column_name not in ('location', 'boundary');
  execute format('grant update (%s) on table public.properties to authenticated', v_columns);
end;
$$;

create or replace function public.set_property_location(p_property_id uuid, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
  v_previous jsonb;
begin
  if (p_lat is null) <> (p_lng is null) then
    raise exception 'latitude and longitude are set or cleared together' using errcode = '22023';
  end if;
  if p_lat is not null and not (p_lat between -90 and 90 and p_lng between -180 and 180) then
    raise exception 'latitude must be within [-90, 90] and longitude within [-180, 180]' using errcode = '22003';
  end if;
  select true, case when p.location is null then null else jsonb_build_object(
      'lat', extensions.st_y(p.location::extensions.geometry),
      'lng', extensions.st_x(p.location::extensions.geometry)) end
    into v_found, v_previous
  from public.properties p
  where p.id = p_property_id and p.deleted_at is null and private.is_member(p.household_id, 'member')
  for update;
  if v_found is null then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  update public.properties
  set location = case when p_lat is null then null
    else extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography end
  where id = p_property_id;
  return v_previous;
end;
$$;

create or replace function public.set_property_boundary(p_property_id uuid, p_boundary jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean;
  v_previous jsonb;
begin
  select true, extensions.st_asgeojson(p.boundary)::jsonb
    into v_found, v_previous
  from public.properties p
  where p.id = p_property_id and p.deleted_at is null and private.is_member(p.household_id, 'member')
  for update;
  if v_found is null then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  update public.properties
  set boundary = case when p_boundary is null then null
    else extensions.st_setsrid(extensions.st_geomfromgeojson(p_boundary::text), 4326) end
  where id = p_property_id;
  return v_previous;
end;
$$;
