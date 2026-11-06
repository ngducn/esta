-- One row per notice the worker owes a member: an email telling them Trợ lý left a note (PLT-4). A row holds no note
-- text, only which note and whether the mail went out.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_item_id uuid not null,
  channel text not null check (channel in ('inapp', 'email', 'push')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (user_id, agent_item_id, channel),
  foreign key (household_id, agent_item_id) references public.agent_items (household_id, id) on delete cascade
);
create index notifications_household_status_idx on public.notifications (household_id, status);
create index notifications_user_day_idx on public.notifications (user_id, created_at);

select private.enable_household_rls('public.notifications', 'member');
select private.enable_audit('public.notifications');

drop policy notifications_select on public.notifications;
drop policy notifications_insert on public.notifications;
drop policy notifications_update on public.notifications;
drop policy notifications_delete on public.notifications;
revoke insert, update, delete on table public.notifications from authenticated;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(household_id, 'viewer'));

-- An audit row of a notice names the member it went to and the SMTP error, so only that member reads it.
create function private.notification_user(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select n.user_id from public.notifications n where n.id = p_id;
$$;
revoke all on function private.notification_user(uuid) from public;
grant execute on function private.notification_user(uuid) to authenticated;

alter policy audit_log_select on public.audit_log
  using (
    private.is_member(household_id, 'viewer')
    and (
      table_name not in ('agent_jobs', 'agent_runs', 'agent_items', 'conversations', 'messages', 'statement_imports', 'statement_rows', 'notifications')
      or (table_name in ('agent_jobs', 'agent_runs', 'agent_items') and private.is_operator(household_id))
      or (table_name = 'agent_items' and private.agent_item_audience(row_id) = 'all')
      or (table_name in ('conversations', 'messages') and private.thread_row_creator(table_name, row_id) = (select auth.uid()))
      or (table_name in ('statement_imports', 'statement_rows') and private.is_member(household_id, 'admin'))
      or (table_name = 'notifications' and private.notification_user(row_id) = (select auth.uid()))
    )
  );
