-- The test clock is keyed by household, so two browser specs that freeze different dates on different households no
-- longer share one row (#208). A row with no household stays as the global date: the one pgTAP tests, the agent worker
-- and the cron routes read, none of which knows a household (FND-9). Production never reads either: the database
-- checks private.local_stack first, and the web and the worker skip the table when ESTA_ENV=production.
alter table public.test_clock drop constraint test_clock_pkey;
alter table public.test_clock add column for_household uuid references public.households (id) on delete cascade;
create unique index test_clock_household on public.test_clock (for_household);
create unique index test_clock_global on public.test_clock ((true)) where for_household is null;

-- The household whose frozen date a database caller sees: the one its signed-in member belongs to. A caller without a
-- session (the service role) belongs to none and reads the global row.
create function private.clock_household()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (select m.household_id from public.household_members m where m.user_id = auth.uid() order by m.created_at, m.id limit 1);
end;
$$;
revoke all on function private.clock_household() from public, anon, authenticated;

create or replace function private.audit_now()
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not exists (select from private.local_stack) then
    return now();
  end if;
  return coalesce(
    (select c.frozen_now from public.test_clock c where c.for_household = private.clock_household()),
    (select c.frozen_now from public.test_clock c where c.for_household is null),
    now());
end;
$$;
