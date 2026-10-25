-- A conversation remembers the last turn that finished: its SDK session, the hash of its canonical input (the replay
-- key a follow-up names, AGENT.md §8) and how many handles that session has handed out, so a follow-up's handles never
-- reuse one the model still remembers.
alter table public.conversations
  add column last_asked_at timestamptz,
  add column sdk_turn_hash text check (sdk_turn_hash ~ '^[0-9a-f]{64}$'),
  add column sdk_handles integer not null default 0 check (sdk_handles >= 0);
update public.conversations c
set last_asked_at = coalesce((select max(m.created_at) from public.messages m where m.household_id = c.household_id and m.conversation_id = c.id and m.role = 'user'), c.created_at);
alter table public.conversations alter column last_asked_at set not null;
drop index public.conversations_household_created_idx;
create index conversations_household_asked_idx on public.conversations (household_id, last_asked_at desc);

drop function public.ask_question(uuid, uuid, text, timestamptz);

create function public.ask_question(p_household_id uuid, p_conversation_id uuid, p_question_id uuid, p_question text, p_deep boolean, p_as_of timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_question text := btrim(coalesce(p_question, ''));
  v_answer_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  v_asked_at timestamptz := p_as_of;
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

  -- No conflict target, because a first send racing its resend can meet the (household_id, id) key instead of the id key.
  insert into public.conversations (id, household_id, title, last_asked_at)
  values (p_conversation_id, p_household_id, left(regexp_replace(v_question, '\s+', ' ', 'g'), 200), p_as_of)
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

  if not v_new then
    if exists (select 1 from public.messages m where m.household_id = p_household_id and m.conversation_id = p_conversation_id and m.status = 'streaming') then
      raise exception 'ESTA_ASK_BUSY' using errcode = '55000';
    end if;
    select greatest(p_as_of, max(m.created_at) + interval '1 millisecond') into v_asked_at
    from public.messages m where m.household_id = p_household_id and m.conversation_id = p_conversation_id;
    update public.conversations set last_asked_at = v_asked_at where id = p_conversation_id;
  end if;

  insert into public.agent_jobs (id, household_id, kind, payload, priority, idempotency_key, run_after, requested_by)
  values (
    v_job_id, p_household_id, 'ask',
    jsonb_build_object('conversation_id', p_conversation_id, 'question_id', p_question_id, 'answer_id', v_answer_id, 'deep', coalesce(p_deep, false)),
    10, 'ask:' || p_question_id, p_as_of, auth.uid()
  );
  insert into public.messages (id, household_id, conversation_id, role, content_md, status, created_at)
  values (p_question_id, p_household_id, p_conversation_id, 'user', v_question, 'done', v_asked_at);
  insert into public.messages (id, household_id, conversation_id, role, status, job_id, created_at)
  values (v_answer_id, p_household_id, p_conversation_id, 'assistant', 'streaming', v_job_id, v_asked_at + interval '1 millisecond');
  return p_conversation_id;
end;
$$;
revoke all on function public.ask_question(uuid, uuid, uuid, text, boolean, timestamptz) from public, anon;
grant execute on function public.ask_question(uuid, uuid, uuid, text, boolean, timestamptz) to authenticated;

-- The worker's last write of a turn: the answer reads done in the same transaction that hands its session to the next
-- question, so a follow-up never resumes a turn whose answer failed or one the family never saw.
create function public.finish_answer(p_household_id uuid, p_answer_id uuid, p_content text, p_refs jsonb, p_handles integer, p_session_id text default null, p_turn_hash text default null)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_conversation_id uuid;
begin
  update public.messages
  set content_md = p_content, refs = p_refs, status = 'done'
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
revoke all on function public.finish_answer(uuid, uuid, text, jsonb, integer, text, text) from public, anon, authenticated;
grant execute on function public.finish_answer(uuid, uuid, text, jsonb, integer, text, text) to service_role;
