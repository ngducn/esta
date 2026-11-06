create table public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('invoices', 'lease_status', 'document_sweep', 'keep_alive')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  ok boolean not null,
  failure text check (failure is null or length(failure) <= 200),
  households_processed integer not null default 0 check (households_processed >= 0),
  households_failed integer not null default 0 check (households_failed >= 0),
  created_at timestamptz not null default now(),
  check (finished_at >= started_at),
  check (ok = (failure is null))
);

create index cron_runs_job_started_idx on public.cron_runs (job, started_at desc);

alter table public.cron_runs enable row level security;
revoke all on table public.cron_runs from public, anon, authenticated, service_role;
grant select, insert on table public.cron_runs to service_role;

create policy cron_runs_service_select on public.cron_runs for select to service_role using (true);
create policy cron_runs_service_insert on public.cron_runs for insert to service_role with check (true);

create function public.cron_job_status(p_household_id uuid)
returns table (job text, started_at timestamptz, finished_at timestamptz, ok boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (r.job) r.job, r.started_at, r.finished_at, r.ok
  from public.cron_runs r
  where private.is_operator(p_household_id)
  order by r.job, r.started_at desc, r.created_at desc
$$;
revoke all on function public.cron_job_status(uuid) from public, anon;
grant execute on function public.cron_job_status(uuid) to authenticated;
