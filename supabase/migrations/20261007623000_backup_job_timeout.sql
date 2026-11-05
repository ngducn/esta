create or replace function private.agent_job_timeout(p_kind text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'ping' then interval '1 minute'
    -- two minutes for the answer and two for its repair turn, each its own session
    when 'ask' then interval '4 minutes'
    when 'portfolio_watch' then interval '3 minutes'
    when 'morning_brief' then interval '3 minutes'
    when 'extract_document' then interval '5 minutes'
    -- copies every table and file of a household, with no model in the loop (AGENT.md §3)
    when 'backup_export' then interval '20 minutes'
    else interval '10 minutes'
  end;
$$;
