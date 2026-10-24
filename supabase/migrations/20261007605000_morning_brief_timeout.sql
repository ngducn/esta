-- morning_brief times out after 3 minutes (apps/agent/src/jobs/registry.ts), so a crashed worker's brief is reclaimed then.
create or replace function private.agent_job_timeout(p_kind text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'ping' then interval '1 minute'
    when 'portfolio_watch' then interval '3 minutes'
    when 'morning_brief' then interval '3 minutes'
    when 'extract_document' then interval '5 minutes'
    else interval '10 minutes'
  end;
$$;
