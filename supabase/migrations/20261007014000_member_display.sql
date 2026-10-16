-- RLS lets only admins update household_members, so a viewer or member changes its own display settings
-- through this function, which writes those three columns of the caller's rows and nothing else (FND-2).
create function public.update_my_display_settings(p_locale text, p_text_scale int, p_density text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.household_members
  set locale = p_locale, text_scale = p_text_scale, density = p_density
  where user_id = (select auth.uid());
$$;

revoke all on function public.update_my_display_settings(text, int, text) from public, anon;
grant execute on function public.update_my_display_settings(text, int, text) to authenticated;
