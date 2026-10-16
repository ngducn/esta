create table public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z_]*$'),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  priority smallint not null default 100,
  run_after timestamptz not null,
  attempts smallint not null default 0 check (attempts >= 0),
  max_attempts smallint not null default 4 check (max_attempts between 1 and 10),
  idempotency_key text unique,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  result jsonb,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id)
);
create index agent_jobs_claim_idx on public.agent_jobs (priority, run_after) where status in ('queued', 'running');
create index agent_jobs_household_kind_idx on public.agent_jobs (household_id, kind, created_at desc);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  job_id uuid not null,
  auth_mode text not null check (auth_mode in ('subscription', 'api_key', 'none')),
  agent_mode text not null check (agent_mode in ('live', 'replay')),
  model text,
  num_turns integer check (num_turns >= 0),
  usage jsonb not null default '{}' check (jsonb_typeof(usage) = 'object'),
  cost_estimate_usd numeric(12, 6) check (cost_estimate_usd >= 0),
  session_id text,
  tool_calls jsonb not null default '{}' check (jsonb_typeof(tool_calls) = 'object'),
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (household_id, job_id) references public.agent_jobs (household_id, id) on delete cascade
);
create index agent_runs_household_started_idx on public.agent_runs (household_id, started_at desc, created_at desc);
create index agent_runs_job_idx on public.agent_runs (job_id);

select private.enable_household_rls('public.agent_jobs', 'admin');
select private.enable_audit('public.agent_jobs');
select private.enable_household_rls('public.agent_runs', 'admin');
select private.enable_audit('public.agent_runs');

-- Diagnostics are operator-only (PLT-1), and every write after the request comes from the worker's service client.
drop policy agent_jobs_select on public.agent_jobs;
drop policy agent_jobs_insert on public.agent_jobs;
drop policy agent_jobs_update on public.agent_jobs;
drop policy agent_jobs_delete on public.agent_jobs;
drop policy agent_runs_select on public.agent_runs;
drop policy agent_runs_insert on public.agent_runs;
drop policy agent_runs_update on public.agent_runs;
drop policy agent_runs_delete on public.agent_runs;

revoke insert, update, delete on table public.agent_jobs from authenticated;
revoke insert, update, delete on table public.agent_runs from authenticated;
grant insert (household_id, kind, run_after, requested_by) on table public.agent_jobs to authenticated;

create policy agent_jobs_select on public.agent_jobs
  for select to authenticated
  using (private.is_operator(household_id));
create policy agent_jobs_insert on public.agent_jobs
  for insert to authenticated
  with check (private.is_operator(household_id) and kind = 'ping' and requested_by = (select auth.uid()));
create policy agent_runs_select on public.agent_runs
  for select to authenticated
  using (private.is_operator(household_id));

create table public.worker_heartbeats (
  worker_id text primary key check (worker_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  host_label text not null,
  version text not null,
  auth_mode text not null check (auth_mode in ('subscription', 'api_key', 'none')),
  agent_mode text not null check (agent_mode in ('live', 'replay')),
  last_seen_at timestamptz not null
);

alter table public.worker_heartbeats enable row level security;
revoke all on table public.worker_heartbeats from anon, authenticated, service_role;
grant select (worker_id, last_seen_at) on table public.worker_heartbeats to authenticated;
grant select, insert, update, delete on table public.worker_heartbeats to service_role;
create policy worker_heartbeats_select on public.worker_heartbeats
  for select to authenticated
  using (true);

-- Mirrors the timeouts in apps/agent/src/jobs/registry.ts, so a crashed worker's job is reclaimed after its kind's timeout.
create function private.agent_job_timeout(p_kind text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_kind when 'ping' then interval '1 minute' else interval '10 minutes' end;
$$;
revoke all on function private.agent_job_timeout(text) from public;

create function public.claim_agent_job(worker_id text, p_as_of timestamptz)
returns setof public.agent_jobs
language plpgsql
volatile
set search_path = ''
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.agent_jobs j
    where (j.status = 'queued' and j.run_after <= p_as_of)
       or (j.status = 'running' and j.locked_at < p_as_of - private.agent_job_timeout(j.kind) - interval '2 minutes')
    order by j.priority, j.run_after
    limit 1
    for update skip locked
  )
  update public.agent_jobs j
  set status = 'running',
      locked_by = claim_agent_job.worker_id,
      locked_at = p_as_of,
      started_at = p_as_of,
      attempts = j.attempts + 1
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;
revoke all on function public.claim_agent_job(text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_agent_job(text, timestamptz) to service_role;
grant execute on function private.agent_job_timeout(text) to service_role;
