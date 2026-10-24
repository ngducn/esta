-- The worker reads the watch snapshot (packages/ops/src/watch.ts) with its service client (AGENT.md §5.3): invoice
-- balances through private.payment_status, and the FIN-3 periods through public.lease_schedule, whose membership check
-- found no member for a caller with no user and so returned no periods.
grant execute on function private.payment_status(bigint, bigint) to service_role;

create or replace function public.lease_schedule(p_lease_ids uuid[], p_until date)
returns table (
  lease_id uuid, period_start date, period_end date, due_date date, cycle_months integer, monthly_rent_vnd bigint,
  rent_vnd bigint, prorated boolean, covered_by_paid_through boolean, invoice_id uuid, invoice_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id, s.period_start, s.period_end, s.period_start + l.due_offset_days, s.cycle_months, s.monthly_rent_vnd, s.rent_vnd,
    s.prorated, coalesce(s.period_end <= l.paid_through_date, false), i.id, i.status
  from public.leases l
  cross join lateral private.lease_periods(l, p_until) s
  left join lateral (
    select i.id, i.status from public.invoices i
    where i.lease_id = l.id and i.period_start between s.period_start and s.period_end
    order by i.status = 'void', i.period_start
    limit 1
  ) i on true
  where l.id = any (p_lease_ids) and l.start_date is not null and l.rent_vnd is not null
    and (private.is_member(l.household_id, 'viewer') or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role')
  order by l.id, s.period_start;
$$;
grant execute on function public.lease_schedule(uuid[], date) to service_role;

create or replace function private.agent_job_timeout(p_kind text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'ping' then interval '1 minute'
    when 'portfolio_watch' then interval '3 minutes'
    when 'extract_document' then interval '5 minutes'
    else interval '10 minutes'
  end;
$$;

-- An operator may run the watch by hand. A hand-queued job carries no idempotency key, so it can never take the key
-- the scheduler gives a day's job; the items it writes meet the same dedupe keys and add nothing twice.
drop policy agent_jobs_insert on public.agent_jobs;
create policy agent_jobs_insert on public.agent_jobs
  for insert to authenticated
  with check (
    private.is_operator(household_id)
    and kind in ('ping', 'portfolio_watch')
    and requested_by = (select auth.uid())
    and idempotency_key is null
  );
