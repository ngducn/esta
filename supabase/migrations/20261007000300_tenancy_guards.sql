create function private.keep_household_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if to_jsonb(new) -> tg_argv[0] is distinct from to_jsonb(old) -> tg_argv[0] then
    raise exception '% rows cannot move to another household', tg_table_name
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.set_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := case when tg_op = 'INSERT' then auth.uid() else old.created_by end;
  return new;
end;
$$;

revoke all on function private.keep_household_column() from public;
revoke all on function private.set_created_by() from public;

create function private.enable_row_guards(p_table regclass, p_household_column name)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger keep_household before update of %I on %s for each row execute function private.keep_household_column(%L)',
    p_household_column, p_table, p_household_column);
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = p_table and a.attname = 'created_by' and not a.attisdropped) then
    execute format('alter table %s alter column created_by drop default', p_table);
    execute format(
      'create trigger set_created_by before insert or update on %s for each row execute function private.set_created_by()',
      p_table);
  end if;
end;
$$;
revoke all on function private.enable_row_guards(regclass, name) from public;

create or replace function private.enable_audit(p_table regclass, p_household_column name default 'household_id')
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = p_table and a.attname = 'id' and not a.attisdropped)
     or not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = p_table and a.attname = p_household_column and not a.attisdropped) then
    raise exception '% needs an id column and a % column for the audit trigger', p_table, p_household_column;
  end if;
  execute format(
    'create trigger audit_row after insert or update or delete on %s for each row execute function private.audit_row(%L)',
    p_table, p_household_column);
  perform private.enable_row_guards(p_table, p_household_column);
end;
$$;

select private.enable_row_guards('public.households', 'id');
select private.enable_row_guards('public.household_members', 'household_id');
select private.enable_row_guards('public.household_settings', 'household_id');
select private.enable_row_guards('public.parties', 'household_id');
select private.enable_row_guards('public.notification_preferences', 'household_id');

create function private.lacks_claimed_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.households h where h.id = p_household_id)
    and not exists (
      select 1
      from public.household_members m
      where m.household_id = p_household_id
        and m.role = 'admin'
        and m.user_id is not null
    );
$$;
revoke all on function private.lacks_claimed_admin(uuid) from public;
grant execute on function private.lacks_claimed_admin(uuid) to authenticated;

create function private.guard_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or old.role <> 'admin' or old.user_id is null then
    return null;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.household_id::text, 0));
  if private.lacks_claimed_admin(old.household_id) then
    raise exception 'a household keeps at least one admin who has signed in'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create trigger guard_last_admin
  after update of role, user_id or delete on public.household_members
  for each row execute function private.guard_last_admin();

create function private.guard_operator_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and new.is_operator is distinct from (case when tg_op = 'UPDATE' then old.is_operator else false end)
     and not private.is_operator(new.household_id) then
    raise exception 'only an operator of the household can grant or revoke operator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_operator_flag
  before insert or update of is_operator on public.household_members
  for each row execute function private.guard_operator_flag();

revoke all on function private.guard_last_admin() from public;
revoke all on function private.guard_operator_flag() from public;

create function private.is_own_member(p_household_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.id = p_member_id
      and m.household_id = p_household_id
      and m.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_own_member(uuid, uuid) from public;
grant execute on function private.is_own_member(uuid, uuid) to authenticated, service_role;

drop policy notification_preferences_insert on public.notification_preferences;
drop policy notification_preferences_update on public.notification_preferences;
drop policy notification_preferences_delete on public.notification_preferences;

create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated
  with check (private.is_own_member(household_id, member_id) or private.is_member(household_id, 'admin'));
create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using (private.is_own_member(household_id, member_id) or private.is_member(household_id, 'admin'))
  with check (private.is_own_member(household_id, member_id) or private.is_member(household_id, 'admin'));
create policy notification_preferences_delete on public.notification_preferences
  for delete to authenticated
  using (private.is_own_member(household_id, member_id) or private.is_member(household_id, 'admin'));
