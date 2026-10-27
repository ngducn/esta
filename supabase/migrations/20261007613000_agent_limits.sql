-- P5-08a: daily caps per household and kind, the worker's usage-limit pause, deferred answers and the Thử lại retry.

-- The caps as data (AGENT.md §9). household_settings.agent.daily_caps.{kind} overrides a default with an integer from 0
-- to 1000; any other value keeps the default. A kind with no row is not capped.
create table private.agent_daily_caps (
  kind text primary key,
  default_cap integer not null check (default_cap between 0 and 1000)
);
insert into private.agent_daily_caps (kind, default_cap) values
  ('extract_document', 30),
  ('ask', 60),
  ('research_scan', 2),
  ('weekly_review', 1);
revoke all on table private.agent_daily_caps from public, anon, authenticated;

create function private.agent_daily_cap(p_household_id uuid, p_kind text)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(o.value) = 'number' and o.value::numeric between 0 and 1000 and o.value::numeric = trunc(o.value::numeric)
      then o.value::integer
    else c.default_cap
  end
  from private.agent_daily_caps c
  left join lateral (
    select s.agent -> 'daily_caps' -> p_kind as value from public.household_settings s where s.household_id = p_household_id
  ) o on true
  where c.kind = p_kind;
$$;
revoke all on function private.agent_daily_cap(uuid, text) from public;
-- claim_agent_job runs as the worker's service role.
grant select on table private.agent_daily_caps to service_role;
grant execute on function private.agent_daily_cap(uuid, text), private.business_date(timestamptz), private.param_uuid(jsonb, text, boolean) to service_role;

-- The cap counts the jobs of a kind that a worker started on the business day, so this index serves that count alone.
create index agent_jobs_household_kind_started_idx on public.agent_jobs (household_id, kind, started_at) where started_at is not null;

-- An ask over its cap keeps its answer row streaming, so the conversation stays busy, and the page says when it runs.
alter table public.messages add column deferred_until timestamptz;

-- The worker says it is paused by a usage limit; every member's status line reads it beside last_seen_at.
alter table public.worker_heartbeats add column state text not null default 'ok' check (state in ('ok', 'usage_limited'));
grant select (state) on table public.worker_heartbeats to authenticated;

-- A job over its household's cap for the business day waits for the next local midnight instead of running. The advisory
-- lock serializes the count per household and kind, so two workers claiming at once never both take the last slot.
create or replace function public.claim_agent_job(worker_id text, p_as_of timestamptz)
returns setof public.agent_jobs
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_job public.agent_jobs;
  v_cap integer;
  v_day_start timestamptz := private.business_date(p_as_of)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  v_next_day timestamptz := (private.business_date(p_as_of) + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
begin
  loop
    select j.* into v_job
    from public.agent_jobs j
    where j.attempts < j.max_attempts
      and ((j.status = 'queued' and j.run_after <= p_as_of)
        or (j.status = 'running' and j.locked_at < p_as_of - private.agent_job_timeout(j.kind) - interval '2 minutes'))
    order by j.priority, j.run_after
    limit 1
    for update skip locked;
    if not found then
      return;
    end if;

    v_cap := private.agent_daily_cap(v_job.household_id, v_job.kind);
    if v_cap is not null then
      perform pg_advisory_xact_lock(hashtextextended('agent_cap:' || v_job.household_id || ':' || v_job.kind, 0));
      if (
        select count(*) from public.agent_jobs o
        where o.household_id = v_job.household_id and o.kind = v_job.kind and o.id <> v_job.id
          and o.started_at >= v_day_start and o.started_at < v_next_day
      ) >= v_cap then
        update public.agent_jobs set status = 'queued', run_after = v_next_day, locked_by = null, locked_at = null where id = v_job.id;
        if v_job.kind = 'ask' and private.param_uuid(v_job.payload, 'answer_id', false) then
          update public.messages set deferred_until = v_next_day
          where household_id = v_job.household_id and id = (v_job.payload ->> 'answer_id')::uuid and status = 'streaming';
        end if;
        continue;
      end if;
    end if;

    return query
    update public.agent_jobs j
    set status = 'running',
        locked_by = claim_agent_job.worker_id,
        locked_at = p_as_of,
        started_at = p_as_of,
        attempts = j.attempts + 1
    where j.id = v_job.id
    returning j.*;
    return;
  end loop;
end;
$$;

-- Thử lại on a failed job's item (AGENT.md §9): an admin queues the job again as a new one keyed
-- `{key}:retry:{n}`, where n counts the retries before it, and the item reads done. The item's row lock and the unique
-- key make a second tap, or a tap from a second tab, queue nothing.
create function public.retry_agent_job(p_item_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.agent_items;
  v_job public.agent_jobs;
  v_payload jsonb;
  v_job_id uuid := gen_random_uuid();
  v_extraction public.document_extractions;
  v_now timestamptz := private.audit_now();
  v_retries integer;
begin
  select * into v_item from public.agent_items i
  where i.id = p_item_id and i.proposal ->> 'type' = 'retry_job'
    and private.is_member(i.household_id, 'admin') and (i.audience = 'all' or private.is_operator(i.household_id))
  for update;
  if not found then
    raise exception 'ESTA_RETRY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_item.status not in ('new', 'read') then
    return;
  end if;
  if private.param_uuid(v_item.proposal -> 'params', 'job_id', false) then
    select * into v_job from public.agent_jobs j
    where j.household_id = v_item.household_id and j.id = (v_item.proposal -> 'params' ->> 'job_id')::uuid and j.status = 'failed';
  end if;
  if v_job.id is null then
    raise exception 'ESTA_RETRY_NOT_FAILED' using errcode = '55000';
  end if;

  v_payload := v_job.payload;
  -- An extraction reads its own row, so a retry starts a new one beside the failed one, and the document shows the
  -- newest. Once a manual entry or another read followed the failure, the failed read is no longer the newest and a
  -- retry would hide that work, so it is refused.
  if v_job.kind = 'extract_document' then
    if private.param_uuid(v_payload, 'extraction_id', false) then
      select * into v_extraction from public.document_extractions x
      where x.household_id = v_job.household_id and x.id = (v_payload ->> 'extraction_id')::uuid and x.status = 'failed'
        and x.id = private.latest_extraction(x.household_id, x.document_id);
    end if;
    if v_extraction.id is null then
      raise exception 'ESTA_RETRY_NOT_FAILED' using errcode = '55000';
    end if;
    v_payload := v_payload || jsonb_build_object('extraction_id', gen_random_uuid());
  end if;

  v_retries := coalesce(substring(v_job.idempotency_key from ':retry:([0-9]+)$')::integer, 0);
  insert into public.agent_jobs (id, household_id, kind, payload, priority, run_after, requested_by, idempotency_key)
  values (
    v_job_id, v_job.household_id, v_job.kind, v_payload, v_job.priority, v_now, auth.uid(),
    coalesce(regexp_replace(v_job.idempotency_key, ':retry:[0-9]+$', ''), v_job.kind || ':' || v_job.id) || ':retry:' || (v_retries + 1)
  )
  on conflict (idempotency_key) do nothing;
  if found and v_extraction.id is not null then
    insert into public.document_extractions (id, household_id, document_id, schema_name, schema_version, job_id)
    values ((v_payload ->> 'extraction_id')::uuid, v_job.household_id, v_extraction.document_id, v_extraction.schema_name, v_extraction.schema_version, v_job_id);
  end if;

  update public.agent_items set status = 'done', decided_by = (select auth.uid()), decided_at = v_now where id = v_item.id;
end;
$$;
revoke all on function public.retry_agent_job(uuid) from public, anon;
grant execute on function public.retry_agent_job(uuid) to authenticated;
