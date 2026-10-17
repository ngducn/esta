-- Seed covers are AVIF at card size, about a third of the WebP bytes on the first screen (#68).
alter table public.properties drop constraint properties_cover_photo_path;
alter table public.properties add constraint properties_cover_photo_path check (
  cover_photo_path ~ ('^' || household_id || '/' || id || '/[a-z0-9-]{1,64}\.(avif|webp|jpe?g|png)$')
);

update storage.buckets set allowed_mime_types = array['image/avif', 'image/webp', 'image/jpeg', 'image/png'] where id = 'property-photos';

create or replace function private.property_photo_household(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]{1,64}\.(avif|webp|jpe?g|png)$' then
    return null;
  end if;
  select p.household_id into v_household
  from public.properties p
  where p.household_id = split_part(p_name, '/', 1)::uuid
    and p.id = split_part(p_name, '/', 2)::uuid;
  return v_household;
end;
$$;

