create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.member_role as enum ('viewer', 'member', 'admin');

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  locale text not null default 'vi' check (locale in ('vi', 'en')),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  invited_email text not null check (invited_email = lower(btrim(invited_email)) and invited_email like '%_@_%'),
  role public.member_role not null default 'member',
  is_operator boolean not null default false,
  display_name text,
  locale text not null default 'vi' check (locale in ('vi', 'en')),
  density text not null default 'comfortable' check (density in ('comfortable', 'compact')),
  text_scale smallint not null default 100 check (text_scale in (100, 115, 130)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, invited_email),
  unique (household_id, user_id)
);
create index household_members_user_id_idx on public.household_members (user_id);

create table public.household_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households (id) on delete cascade,
  agent jsonb not null default '{}' check (jsonb_typeof(agent) = 'object'),
  invoicing jsonb not null default '{}' check (jsonb_typeof(invoicing) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('individual', 'organization')),
  full_name text not null check (btrim(full_name) <> ''),
  short_name text,
  phone text,
  zalo_phone text,
  email text,
  id_last4 text check (id_last4 ~ '^[0-9]{4}$'),
  tax_code text check (tax_code is null or kind = 'organization'),
  address_text text,
  notes text,
  tags text[] not null default '{}'
    check (tags <@ array['owner', 'tenant', 'caretaker', 'broker', 'contractor', 'bank', 'other']),
  member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, member_id)
    references public.household_members (household_id, id) on delete set null (member_id)
);
create index parties_household_member_idx on public.parties (household_id, member_id);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null,
  channel text not null check (channel in ('inapp', 'email', 'push')),
  kinds text[] not null default '{}',
  daily_cap integer check (daily_cap > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (member_id, channel),
  foreign key (household_id, member_id)
    references public.household_members (household_id, id) on delete cascade
);
create index notification_preferences_household_member_idx
  on public.notification_preferences (household_id, member_id);

-- security definer so policies on household_members can call it without recursing into
-- household_members' own RLS.
create function private.is_member(p_household_id uuid, p_min_role public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
      and m.role >= p_min_role
  );
$$;

create function private.is_operator(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
      and m.is_operator
  );
$$;

revoke all on function private.is_member(uuid, public.member_role) from public;
revoke all on function private.is_operator(uuid) from public;
grant execute on function private.is_member(uuid, public.member_role) to authenticated, service_role;
grant execute on function private.is_operator(uuid) to authenticated, service_role;

create function private.enable_household_rls(
  p_table regclass,
  p_write_role public.member_role,
  p_household_column name default 'household_id'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := (select c.relname from pg_catalog.pg_class c where c.oid = p_table);
  v_read text := format('private.is_member(%I, %L)', p_household_column, 'viewer');
  v_write text := format('private.is_member(%I, %L)', p_household_column, p_write_role);
begin
  execute format('alter table %s enable row level security', p_table);
  execute format('revoke all on table %s from anon, authenticated', p_table);
  execute format('revoke truncate on table %s from service_role', p_table);
  execute format('grant select, insert, update, delete on table %s to authenticated', p_table);
  execute format('create policy %I on %s for select to authenticated using (%s)',
    v_name || '_select', p_table, v_read);
  execute format('create policy %I on %s for insert to authenticated with check (%s)',
    v_name || '_insert', p_table, v_write);
  execute format('create policy %I on %s for update to authenticated using (%s) with check (%s)',
    v_name || '_update', p_table, v_write, v_write);
  execute format('create policy %I on %s for delete to authenticated using (%s)',
    v_name || '_delete', p_table, v_write);
  execute format(
    'create trigger touch_updated_at before update on %s for each row execute function private.touch_updated_at()',
    p_table);
end;
$$;
revoke all on function private.enable_household_rls(regclass, public.member_role, name) from public;

select private.enable_household_rls('public.households', 'admin', 'id');
select private.enable_household_rls('public.household_members', 'admin');
select private.enable_household_rls('public.household_settings', 'admin');
select private.enable_household_rls('public.parties', 'member');
select private.enable_household_rls('public.notification_preferences', 'member');
