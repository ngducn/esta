-- Document extraction (SPEC \u00A75.5, AGENT.md \u00A75.1, DOC-6). An upload in an extractable category queues one
-- extract_document job and one extraction row; the worker reads the file, fills the row and leaves an item for Mẹ.
-- Members see a document's state through document_status, never through the operator-only agent_jobs and agent_runs.

-- Overwrites every match of p_pattern with as many # signs, so a date or an amount stops being digits and every
-- distance from an ID label stays what the reducer measures.
create function private.blank_matches(p_text text, p_pattern text, p_flags text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text := p_text;
  v_from integer;
  v_to integer;
begin
  for v_n in 1 .. regexp_count(p_text, p_pattern, 1, p_flags) loop
    v_from := regexp_instr(p_text, p_pattern, 1, v_n, 0, p_flags);
    v_to := regexp_instr(p_text, p_pattern, 1, v_n, 1, p_flags);
    v_out := overlay(v_out placing repeat('#', v_to - v_from) from v_from for v_to - v_from);
  end loop;
  return v_out;
end;
$$;
revoke all on function private.blank_matches(text, text, text) from public;
grant execute on function private.blank_matches(text, text, text) to authenticated, service_role;

-- SPEC D11: the worker keeps only the last four digits of a national ID (reduceNationalIds). This refuses any string or
-- number in an extraction that still holds one, in case a later path skips the reduction, by the reducer's rules: 9 to
-- 12 digits starting within 40 characters after an ID label, whatever stands between, or 12 digits anywhere, grouped
-- by the same separators, with zero-width characters removed, and dates and amounts in đồng never part of a number.
-- Without a label, a run after a utility code's prefix (PE012345678901) passes. supabase/tests/national_id.test.sql
-- runs the reducer's vectors.
create function private.holds_national_id(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_or(
    plain ~* '(cccd|cmtnd|cmnd|cmt|căn cước|chứng minh|định danh|đdcn|số thẻ|\yid\y).{0,40}(?<![0-9])(?<![0-9]\.)[0-9](?:(?:[[:space:]]{1,3}|[./,_\u2010-\u2015-])?[0-9]){8,11}(?![0-9])(?!\.[0-9])'
    or plain ~* '(?<![0-9])(?<![0-9]\.)(?<![^[:alpha:]](?:pa|pb|pc|pd|pe))[0-9](?:(?:[ \t\u000B\u000C\u1680\u2028\u2029]{1,3}|\r?\n|[.,_\u2010-\u2015-])?[0-9]){11}(?![0-9])(?!\.[0-9])'
  ), false)
  from jsonb_path_query(coalesce(p_value, 'null'::jsonb), 'strict $.**') as scalar
  cross join lateral (
    select private.blank_matches(
      private.blank_matches(
        ' ' || regexp_replace(normalize(scalar #>> '{}', NFKC), '[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]', '', 'g') || ' ',
        '(?<![0-9])(?:(?:0?[1-9]|[12][0-9]|3[01])([./-])(?:0?[1-9]|1[0-2])\1(?:19|20)?[0-9]{2}|(?:19|20)[0-9]{2}([./-])(?:0?[1-9]|1[0-2])\2(?:0?[1-9]|[12][0-9]|3[01])|(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01]))(?![0-9])', ''),
      '(?<![0-9])(?<![0-9][.,])[1-9][0-9]{0,2}(?:(?:\.[0-9]{3})+|(?:,[0-9]{3})+)?(?![0-9])(?![.,][0-9])(?=[[:space:]]?(?:đ|đồng|vnd|vnđ)(?![[:alnum:]]))', 'i') as plain
  ) as cleaned
  where jsonb_typeof(scalar) in ('string', 'number');
$$;
revoke all on function private.holds_national_id(jsonb) from public;
grant execute on function private.holds_national_id(jsonb) to authenticated, service_role;

create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  document_id uuid not null,
  schema_name text not null check (schema_name in ('certificate_v1', 'utility_bill_v1')),
  schema_version smallint not null check (schema_version >= 1),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'needs_review', 'accepted', 'rejected', 'failed')),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  field_confidence jsonb check (field_confidence is null or jsonb_typeof(field_confidence) = 'object'),
  model text,
  job_id uuid,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  accepted_fields jsonb check (accepted_fields is null or jsonb_typeof(accepted_fields) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, document_id) references public.documents (household_id, id) on delete cascade,
  foreign key (household_id, job_id) references public.agent_jobs (household_id, id) on delete set null (job_id),
  constraint document_extractions_no_national_id
    check (not private.holds_national_id(result) and not private.holds_national_id(accepted_fields))
);
create index document_extractions_latest_idx on public.document_extractions (household_id, document_id, created_at desc, id desc);
create unique index document_extractions_job_idx on public.document_extractions (job_id) where job_id is not null;

select private.enable_household_rls('public.document_extractions', 'member');
select private.enable_audit('public.document_extractions');

-- The same guard on the extraction's history, so a full ID cannot reach the audit diff by any path either.
alter table public.audit_log
  add constraint audit_log_extraction_no_national_id
  check (
    table_name <> 'document_extractions'
    or not (private.holds_national_id(diff -> 'result') or private.holds_national_id(diff -> 'accepted_fields'))
  );

-- Only enqueue_extract_document inserts a member's row, and a member changes only the review columns. The worker
-- writes the rest through the service role. Nobody deletes an extraction; it goes with its document.
drop policy document_extractions_delete on public.document_extractions;
revoke insert, update, delete on table public.document_extractions from authenticated;
grant insert (id, household_id, document_id, schema_name, schema_version, job_id) on table public.document_extractions to authenticated;
grant update (status, accepted_fields, reviewed_by, reviewed_at) on table public.document_extractions to authenticated;

-- The allowed status changes. The worker's moves run as the service role; a member only accepts or rejects.
create function private.check_extraction_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not exists (
    select 1
    from (values
      ('queued', 'running', false),
      ('running', 'needs_review', false),
      ('running', 'failed', false),
      ('queued', 'failed', false),
      ('needs_review', 'accepted', true),
      ('needs_review', 'rejected', true)
    ) as allowed (from_status, to_status, by_member)
    where allowed.from_status = old.status
      and allowed.to_status = new.status
      and (allowed.by_member or current_user <> 'authenticated')
  ) then
    raise exception 'document_extractions: status % cannot become %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_extraction_status() from public;

create trigger check_extraction_status
  before update of status on public.document_extractions
  for each row execute function private.check_extraction_status();

alter publication supabase_realtime add table public.document_extractions;

-- P1-07 left extraction_id a bare uuid until this table existed. Keyed on the household, as certificates.document_id is.
alter table public.certificates
  add constraint certificates_extraction_id_fkey foreign key (household_id, extraction_id)
  references public.document_extractions (household_id, id) on delete set null (extraction_id);

-- One row per document with its latest extraction's status, or none. Security invoker, so RLS on both tables decides.
create view public.document_status with (security_invoker = true) as
select
  d.id as document_id,
  d.household_id,
  d.property_id,
  latest.id as extraction_id,
  coalesce(latest.status, 'none') as status
from public.documents d
left join lateral (
  select x.id, x.status
  from public.document_extractions x
  where x.household_id = d.household_id and x.document_id = d.id
  order by x.created_at desc, x.id desc
  limit 1
) latest on true;
revoke all on public.document_status from anon;
grant select on public.document_status to authenticated;

-- Agent items (AGENT.md §10): what the assistant tells the household. Operator items reach operators only (FND-2).
create table public.agent_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('brief', 'alert', 'proposal', 'answer_note', 'research_scan_empty', 'system')),
  severity text not null check (severity in ('info', 'watch', 'action')),
  audience text not null default 'all' check (audience in ('all', 'operator')),
  title text not null check (btrim(title) <> '' and char_length(title) <= 300),
  body_md text,
  related jsonb not null default '{}' check (jsonb_typeof(related) = 'object'),
  citations jsonb not null default '[]' check (jsonb_typeof(citations) = 'array'),
  proposal jsonb check (proposal is null or jsonb_typeof(proposal) = 'object'),
  status text not null default 'new' check (status in ('new', 'read', 'approved', 'dismissed', 'done', 'failed')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  job_id uuid,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, dedupe_key),
  foreign key (household_id, job_id) references public.agent_jobs (household_id, id) on delete set null (job_id)
);
create index agent_items_household_status_idx on public.agent_items (household_id, status, created_at desc);

select private.enable_household_rls('public.agent_items', 'member');
select private.enable_audit('public.agent_items');

drop policy agent_items_select on public.agent_items;
drop policy agent_items_insert on public.agent_items;
drop policy agent_items_update on public.agent_items;
drop policy agent_items_delete on public.agent_items;
revoke insert, update, delete on table public.agent_items from authenticated;
grant update (status) on table public.agent_items to authenticated;

create policy agent_items_select on public.agent_items
  for select to authenticated
  using (private.is_member(household_id, 'viewer') and (audience = 'all' or private.is_operator(household_id)));
create policy agent_items_update on public.agent_items
  for update to authenticated
  using (private.is_member(household_id, 'member') and (audience = 'all' or private.is_operator(household_id)))
  with check (private.is_member(household_id, 'member') and (audience = 'all' or private.is_operator(household_id)));

-- An item's audit diff carries its title and body, so an operator item's history follows the operator rule too.
create function private.agent_item_audience(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select i.audience from public.agent_items i where i.id = p_id;
$$;
revoke all on function private.agent_item_audience(uuid) from public;
grant execute on function private.agent_item_audience(uuid) to authenticated;

alter policy audit_log_select on public.audit_log
  using (
    private.is_member(household_id, 'viewer')
    and (
      table_name not in ('agent_jobs', 'agent_runs', 'agent_items')
      or private.is_operator(household_id)
      or (table_name = 'agent_items' and private.agent_item_audience(row_id) = 'all')
    )
  );

-- A member queues an extraction only for a live document of an extractable category, with the one idempotency key
-- that document's bytes give, so each document gets at most one extract_document job.
grant insert (id, payload, idempotency_key) on table public.agent_jobs to authenticated;
create policy agent_jobs_insert_extract on public.agent_jobs
  for insert to authenticated
  with check (
    kind = 'extract_document'
    and requested_by = (select auth.uid())
    and private.is_member(household_id, 'member')
    and exists (
      select 1
      from public.documents d
      where d.household_id = agent_jobs.household_id
        and d.id::text = agent_jobs.payload ->> 'document_id'
        and d.deleted_at is null
        and d.category in ('certificate', 'utility_bill')
        and agent_jobs.idempotency_key = 'extract_document:' || d.id || ':' || d.sha256
    )
  );

create or replace function private.agent_job_timeout(p_kind text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'ping' then interval '1 minute'
    when 'extract_document' then interval '5 minutes'
    else interval '10 minutes'
  end;
$$;

-- A job whose last attempt's worker stopped stays running until a worker claims it with claim_abandoned_agent_job and
-- fails it through its kind's failure step, which marks the extraction failed, leaves the Retry item and deletes the
-- job's files. Failing it here in SQL skipped that step and left the extraction reading forever.
create or replace function public.claim_agent_job(worker_id text, p_as_of timestamptz)
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
    where j.attempts < j.max_attempts
      and ((j.status = 'queued' and j.run_after <= p_as_of)
        or (j.status = 'running' and j.locked_at < p_as_of - private.agent_job_timeout(j.kind) - interval '2 minutes'))
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

-- Locks the job to the worker that fails it. A worker that stops while failing it leaves it to the next claim, and the
-- failure step is idempotent, so the job still ends failed exactly once.
create function public.claim_abandoned_agent_job(worker_id text, p_as_of timestamptz)
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
    where j.status = 'running'
      and j.attempts >= j.max_attempts
      and j.locked_at < p_as_of - private.agent_job_timeout(j.kind) - interval '2 minutes'
    order by j.locked_at
    limit 1
    for update skip locked
  )
  update public.agent_jobs j
  set locked_by = claim_abandoned_agent_job.worker_id,
      locked_at = p_as_of
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;
revoke all on function public.claim_abandoned_agent_job(text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_abandoned_agent_job(text, timestamptz) to service_role;

create function private.latest_extraction(p_household_id uuid, p_document_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select x.id
  from public.document_extractions x
  where x.household_id = p_household_id and x.document_id = p_document_id
  order by x.created_at desc, x.id desc
  limit 1;
$$;
revoke all on function private.latest_extraction(uuid, uuid) from public;
grant execute on function private.latest_extraction(uuid, uuid) to authenticated;

-- Security invoker: the document is read under the caller's RLS and both rows are written as the caller. A second
-- call for the same document and bytes queues nothing and returns the extraction the first call made. A member cannot
-- read agent_jobs, and ON CONFLICT would need to, so a concurrent second call meets the unique key as an error instead.
create function public.enqueue_extract_document(p_document_id uuid, p_as_of timestamptz)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_document record;
  v_schema text;
  v_job_id uuid := gen_random_uuid();
  v_extraction_id uuid := gen_random_uuid();
begin
  select d.id, d.household_id, d.category, d.sha256
  into v_document
  from public.documents d
  where d.id = p_document_id and d.deleted_at is null;
  if not found then
    return null;
  end if;

  select extractable.schema_name into v_schema
  from (values ('certificate', 'certificate_v1'), ('utility_bill', 'utility_bill_v1')) as extractable (category, schema_name)
  where extractable.category = v_document.category;
  if v_schema is null then
    return null;
  end if;

  if exists (select 1 from public.document_extractions x where x.household_id = v_document.household_id and x.document_id = v_document.id) then
    return private.latest_extraction(v_document.household_id, v_document.id);
  end if;

  begin
    insert into public.agent_jobs (id, household_id, kind, payload, idempotency_key, run_after, requested_by)
    values (
      v_job_id,
      v_document.household_id,
      'extract_document',
      jsonb_build_object('document_id', v_document.id, 'extraction_id', v_extraction_id),
      'extract_document:' || v_document.id || ':' || v_document.sha256,
      p_as_of,
      auth.uid()
    );
  exception when unique_violation then
    return private.latest_extraction(v_document.household_id, v_document.id);
  end;

  insert into public.document_extractions (id, household_id, document_id, schema_name, schema_version, job_id)
  values (v_extraction_id, v_document.household_id, v_document.id, v_schema, 1, v_job_id);
  return v_extraction_id;
end;
$$;
revoke all on function public.enqueue_extract_document(uuid, timestamptz) from public, anon;
grant execute on function public.enqueue_extract_document(uuid, timestamptz) to authenticated;
