alter table public.messages
  add column activity text check (activity = 'web');

create or replace function public.finish_answer(p_household_id uuid, p_answer_id uuid, p_content text, p_refs jsonb, p_handles integer, p_session_id text default null, p_turn_hash text default null)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  update public.messages
  set content_md = p_content, refs = p_refs, status = 'done', activity = null
  where household_id = p_household_id and id = p_answer_id and role = 'assistant' and status = 'streaming'
  returning conversation_id into v_conversation_id;
  if not found then
    raise exception 'ESTA_ANSWER_NOT_STREAMING' using errcode = 'P0002';
  end if;
  update public.conversations
  set sdk_session_id = p_session_id, sdk_turn_hash = p_turn_hash, sdk_handles = p_handles
  where household_id = p_household_id and id = v_conversation_id;
end;
$$;

create or replace function private.agent_job_timeout(p_kind text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'ping' then interval '1 minute'
    -- a turn is at most three sessions of three minutes each (the answer, a number repair and a source repair), nine minutes;
    -- ten, and the claim's two minutes of grace after it, keep a second worker from taking a turn that is still running
    when 'ask' then interval '10 minutes'
    when 'portfolio_watch' then interval '3 minutes'
    when 'morning_brief' then interval '3 minutes'
    when 'extract_document' then interval '5 minutes'
    -- copies every table and file of a household, with no model in the loop (AGENT.md §3)
    when 'backup_export' then interval '20 minutes'
    else interval '10 minutes'
  end;
$$;
