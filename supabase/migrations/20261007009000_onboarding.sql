create function private.session_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(u.email))
  from auth.users u
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null;
$$;
revoke all on function private.session_email() from public;

create function public.claim_pending_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := private.session_email();
  v_claimed integer;
begin
  if v_user is null or v_email is null then
    raise exception 'claiming invites needs a signed-in user with a confirmed email'
      using errcode = '42501';
  end if;
  update public.household_members m
  set user_id = v_user
  where m.user_id is null
    and m.invited_email = v_email
    and not exists (
      select 1 from public.household_members other
      where other.household_id = m.household_id and other.user_id = v_user
    );
  get diagnostics v_claimed = row_count;
  return v_claimed;
end;
$$;

create function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := private.session_email();
  v_name text := btrim(p_name);
  v_display_name text := btrim(p_display_name);
  v_household uuid;
begin
  if v_user is null or v_email is null then
    raise exception 'creating a household needs a signed-in user with a confirmed email'
      using errcode = '42501';
  end if;
  if coalesce(v_name, '') = '' or coalesce(v_display_name, '') = ''
     or length(v_name) > 120 or length(v_display_name) > 120 then
    raise exception 'a household needs a name and a display name of at most 120 characters'
      using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  if exists (select 1 from public.household_members m where m.user_id = v_user) then
    raise exception 'this user already belongs to a household'
      using errcode = '23505';
  end if;

  insert into public.households (name) values (v_name) returning id into v_household;
  insert into public.household_settings (household_id) values (v_household);
  insert into public.household_members (household_id, user_id, invited_email, role, is_operator, display_name)
  values (v_household, v_user, v_email, 'admin', true, v_display_name);
  return v_household;
end;
$$;

create function public.invite_member(p_household_id uuid, p_email text, p_role public.member_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_member uuid;
  v_existing public.household_members;
begin
  if not private.is_member(p_household_id, 'admin') then
    raise exception 'only an admin of the household can invite'
      using errcode = '42501';
  end if;
  if p_role is null then
    raise exception 'an invite needs a role'
      using errcode = '22023';
  end if;

  insert into public.household_members (household_id, invited_email, role)
  values (p_household_id, v_email, p_role)
  on conflict (household_id, invited_email) do nothing
  returning id into v_member;
  if v_member is not null then
    return v_member;
  end if;

  select * into v_existing
  from public.household_members m
  where m.household_id = p_household_id and m.invited_email = v_email;
  if v_existing.user_id is null and v_existing.role = p_role and not v_existing.is_operator then
    return v_existing.id;
  end if;
  raise exception 'this email is already invited to or a member of the household'
    using errcode = '23505';
end;
$$;

create function public.set_my_locale(p_locale text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.household_members
  set locale = p_locale
  where user_id = (select auth.uid());
$$;

revoke all on function public.claim_pending_invites() from public, anon;
revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.invite_member(uuid, text, public.member_role) from public, anon;
revoke all on function public.set_my_locale(text) from public, anon;
grant execute on function public.claim_pending_invites() to authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.invite_member(uuid, text, public.member_role) to authenticated;
grant execute on function public.set_my_locale(text) to authenticated;

create function private.guard_operator_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.is_operator and not private.is_operator(old.household_id) then
    raise exception 'only an operator of the household can change or remove an operator'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.guard_operator_row() from public;

create trigger guard_operator_row
  before update or delete on public.household_members
  for each row execute function private.guard_operator_row();

revoke select on table public.admin_units, public.admin_unit_legacy_map from anon;
revoke all on function public.suggest_current_unit(text) from anon;
revoke all on sequence public.admin_unit_legacy_map_id_seq from anon, authenticated;
