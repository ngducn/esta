alter table public.properties add column cover_photo_path text;

-- Interpolating the row's own ids means a path can only ever name this property's folder.
alter table public.properties add constraint properties_cover_photo_path check (
  cover_photo_path ~ ('^' || household_id || '/' || id || '/[a-z0-9-]{1,64}\.(webp|jpe?g|png)$')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-photos', 'property-photos', false, 5242880, array['image/webp', 'image/jpeg', 'image/png']);

-- deleted_at is ignored on purpose: an archived property stays readable and restorable (PRP-1), so its photo stays signable.
create function private.property_photo_household(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]{1,64}\.(webp|jpe?g|png)$' then
    return null;
  end if;
  select p.household_id into v_household
  from public.properties p
  where p.household_id = split_part(p_name, '/', 1)::uuid
    and p.id = split_part(p_name, '/', 2)::uuid;
  return v_household;
end;
$$;

revoke all on function private.property_photo_household(text) from public;
grant execute on function private.property_photo_household(text) to authenticated, service_role;

create policy property_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'property-photos' and private.is_member(private.property_photo_household(name), 'viewer'));

create policy property_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'property-photos' and private.is_member(private.property_photo_household(name), 'member'));

create policy property_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'property-photos' and private.is_member(private.property_photo_household(name), 'member'))
  with check (bucket_id = 'property-photos' and private.is_member(private.property_photo_household(name), 'member'));

create policy property_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'property-photos' and private.is_member(private.property_photo_household(name), 'member'));

create view public.property_list_rows with (security_invoker = true) as
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
    p.certificate_address_text, legacy.unit_names)), '[\s,;]+', ' ', 'g') as search_text
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

revoke all on public.property_list_rows from anon, authenticated;
grant select on public.property_list_rows to authenticated;
