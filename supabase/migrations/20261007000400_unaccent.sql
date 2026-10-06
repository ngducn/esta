-- Accent- and case-insensitive search (DOMAIN-VN §9), matching foldVietnamese in packages/core.

create extension if not exists unaccent with schema extensions;

-- unaccent() is only stable because its dictionary is looked up by name; pinning the
-- dictionary by schema lets this wrapper be immutable so expression indexes can use it.
create function public.esta_unaccent(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, normalize(p_text, NFC)));
$$;

grant execute on function public.esta_unaccent(text) to anon, authenticated, service_role;
