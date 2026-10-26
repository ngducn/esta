-- A question's audit history carries its text, and an answer's carries what Trợ lý wrote, so the history of a
-- conversation or a message follows the rule of the row itself: only the member who started it reads it (P5-12).
create function private.thread_row_creator(p_table text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_table
    when 'conversations' then (select c.created_by from public.conversations c where c.id = p_id)
    when 'messages' then (select m.created_by from public.messages m where m.id = p_id)
  end;
$$;
revoke all on function private.thread_row_creator(text, uuid) from public;
grant execute on function private.thread_row_creator(text, uuid) to authenticated;

alter policy audit_log_select on public.audit_log
  using (
    private.is_member(household_id, 'viewer')
    and (
      table_name not in ('agent_jobs', 'agent_runs', 'agent_items', 'conversations', 'messages')
      or (table_name in ('agent_jobs', 'agent_runs', 'agent_items') and private.is_operator(household_id))
      or (table_name = 'agent_items' and private.agent_item_audience(row_id) = 'all')
      or (table_name in ('conversations', 'messages') and private.thread_row_creator(table_name, row_id) = (select auth.uid()))
    )
  );

create index messages_creator_created_idx on public.messages (household_id, created_by, created_at);

-- A member's thread runs on one clock and holds one answer at a time, across all her segments:
-- - she waits while any of her answers streams, so a send after midnight or past the twentieth question never starts a
--   second answer beside the first;
-- - each message is stamped after her last one in any segment, so a new segment never sorts before the one it
--   follows, even on a frozen test clock where every send in a segment moves its stamp a millisecond past the clock.
create or replace function public.ask_question(p_household_id uuid, p_conversation_id uuid, p_question_id uuid, p_question text, p_deep boolean, p_as_of timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_question text := btrim(coalesce(p_question, ''));
  v_answer_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  v_asked_at timestamptz;
  v_new boolean;
begin
  if not private.is_member(p_household_id, 'viewer') then
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;
  if v_question = '' or char_length(v_question) > 2000 then
    raise exception 'ESTA_ASK_INVALID' using errcode = '22023';
  end if;
  if coalesce(p_deep, false) and not private.is_operator(p_household_id) then
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;

  select greatest(p_as_of, max(m.created_at) + interval '1 millisecond') into v_asked_at
  from public.messages m where m.household_id = p_household_id and m.created_by = v_user;
  v_asked_at := coalesce(v_asked_at, p_as_of);

  -- No conflict target, because a first send racing its resend can meet the (household_id, id) key instead of the id key.
  insert into public.conversations (id, household_id, title, last_asked_at)
  values (p_conversation_id, p_household_id, left(regexp_replace(v_question, '\s+', ' ', 'g'), 200), v_asked_at)
  on conflict do nothing;
  v_new := found;
  if not v_new then
    perform 1 from public.conversations c where c.id = p_conversation_id and c.household_id = p_household_id for update;
    if not found then
      raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  if exists (select 1 from public.messages m where m.id = p_question_id) then
    if exists (select 1 from public.messages m where m.id = p_question_id and m.household_id = p_household_id and m.conversation_id = p_conversation_id and m.role = 'user') then
      return p_conversation_id;
    end if;
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;

  if exists (select 1 from public.messages m where m.household_id = p_household_id and m.created_by = v_user and m.status = 'streaming') then
    raise exception 'ESTA_ASK_BUSY' using errcode = '55000';
  end if;
  if not v_new then
    update public.conversations set last_asked_at = v_asked_at where id = p_conversation_id;
  end if;

  insert into public.agent_jobs (id, household_id, kind, payload, priority, idempotency_key, run_after, requested_by)
  values (
    v_job_id, p_household_id, 'ask',
    jsonb_build_object('conversation_id', p_conversation_id, 'question_id', p_question_id, 'answer_id', v_answer_id, 'deep', coalesce(p_deep, false)),
    10, 'ask:' || p_question_id, p_as_of, v_user
  );
  insert into public.messages (id, household_id, conversation_id, role, content_md, status, created_at)
  values (p_question_id, p_household_id, p_conversation_id, 'user', v_question, 'done', v_asked_at);
  insert into public.messages (id, household_id, conversation_id, role, status, job_id, created_at)
  values (v_answer_id, p_household_id, p_conversation_id, 'assistant', 'streaming', v_job_id, v_asked_at + interval '1 millisecond');
  return p_conversation_id;
end;
$$;
