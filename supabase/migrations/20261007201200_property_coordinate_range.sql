-- Geography input wraps an out-of-range point (longitude 407 is stored as 47) before any check sees it,
-- so the range guard for a pin lives in the write function, and only the geometry boundary takes a check.
create or replace function public.set_property_location(p_property_id uuid, p_lat double precision default null, p_lng double precision default null)
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
  if p_lat is not null and not (p_lat between -90 and 90 and p_lng between -180 and 180) then
    raise exception 'latitude must be within [-90, 90] and longitude within [-180, 180]' using errcode = '22003';
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

alter table public.properties add constraint properties_boundary_in_range check (
  boundary is null or (
    extensions.st_ymin(boundary) >= -90 and extensions.st_ymax(boundary) <= 90
    and extensions.st_xmin(boundary) >= -180 and extensions.st_xmax(boundary) <= 180
  )
);
