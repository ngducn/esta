create table public.audit_log (
  id bigint generated always as identity primary key,
  household_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_kind text not null check (actor_kind in ('user', 'agent', 'system')),
  actor_id text not null,
  diff jsonb not null,
  at timestamptz not null default now()
);
create index audit_log_household_at_idx on public.audit_log (household_id, at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id, at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated, service_role;
grant select on table public.audit_log to authenticated, service_role;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (private.is_member(household_id, 'viewer'));

create function private.audit_actor(out actor_kind text, out actor_id text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_claimed text;
begin
  if v_claims ->> 'role' = 'authenticated' and auth.uid() is not null then
    actor_kind := 'user';
    actor_id := auth.uid()::text;
    return;
  end if;

  if v_claims ->> 'role' = 'service_role' then
    v_claimed := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-esta-actor';
    if v_claimed is null then
      raise exception 'service_role writes must send the x-esta-actor header'
        using errcode = '42501';
    end if;
  else
    v_claimed := nullif(current_setting('esta.actor', true), '');
    if v_claimed is null and v_claims is not null then
      raise exception 'an API write as % must name its actor with esta.actor', coalesce(v_claims ->> 'role', 'an unknown role')
        using errcode = '42501';
    end if;
  end if;

  if v_claimed is null then
    actor_kind := 'system';
    actor_id := session_user;
    return;
  end if;

  if v_claimed !~ '^(agent|system):[A-Za-z0-9._-]+$' then
    raise exception 'audit actor must look like agent:<id> or system:<name>, got %', v_claimed
      using errcode = '22023';
  end if;
  actor_kind := split_part(v_claimed, ':', 1);
  actor_id := substr(v_claimed, length(actor_kind) + 2);
end;
$$;

create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' end;
  v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_household_column text := tg_argv[0];
  v_actor record;
  v_diff jsonb;
begin
  select * into v_actor from private.audit_actor();

  select coalesce(jsonb_object_agg(k.key, jsonb_build_object('old', v_old -> k.key, 'new', v_new -> k.key)), '{}')
  into v_diff
  from jsonb_object_keys(coalesce(v_old, '{}') || coalesce(v_new, '{}')) as k (key)
  where coalesce(v_old -> k.key, 'null') is distinct from coalesce(v_new -> k.key, 'null');

  if tg_op = 'UPDATE' and v_diff = '{}' then
    return null;
  end if;

  insert into public.audit_log (household_id, table_name, row_id, action, actor_kind, actor_id, diff)
  values (
    (v_row ->> v_household_column)::uuid,
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    v_actor.actor_kind,
    v_actor.actor_id,
    v_diff
  );
  return null;
end;
$$;

revoke all on function private.audit_actor() from public;
revoke all on function private.audit_row() from public;

create function private.enable_audit(p_table regclass, p_household_column name default 'household_id')
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
end;
$$;
revoke all on function private.enable_audit(regclass, name) from public;

select private.enable_audit('public.households', 'id');
select private.enable_audit('public.household_members');
select private.enable_audit('public.household_settings');
select private.enable_audit('public.parties');
select private.enable_audit('public.notification_preferences');
