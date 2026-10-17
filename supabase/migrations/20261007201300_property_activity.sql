-- The audit clock follows the test clock (FND-9) when a row exists, so a history entry written at a frozen time reads
-- that time. Production never has a test_clock row: only service_role writes it, and `pnpm clock:set` refuses any
-- host but localhost.
create function private.audit_now()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select frozen_now from public.test_clock), now());
$$;
revoke all on function private.audit_now() from public;

alter table public.audit_log alter column at set default private.audit_now();

-- Security invoker, so RLS on audit_log keeps the history inside the member's households and household_members
-- supplies only the names that member may read. Ordered by id, the insert order, because a frozen clock can stamp
-- a later write with an earlier time than the seed's.
create function public.property_activity(p_property_id uuid, p_limit int default 50)
returns table (
  id bigint,
  at timestamptz,
  action text,
  actor_kind text,
  actor_id text,
  actor_name text,
  diff jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.at, a.action, a.actor_kind, a.actor_id, m.display_name, a.diff
  from public.audit_log a
  left join public.household_members m
    on a.actor_kind = 'user' and m.household_id = a.household_id and m.user_id::text = a.actor_id
  where a.table_name = 'properties' and a.row_id = p_property_id
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.property_activity(uuid, int) from public, anon;
grant execute on function public.property_activity(uuid, int) to authenticated;
