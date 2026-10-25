create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  sdk_session_id text check (char_length(sdk_session_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id)
);
create index conversations_household_created_idx on public.conversations (household_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content_md text not null default '' check (char_length(content_md) <= 4000),
  status text not null check (status in ('streaming', 'done', 'error')),
  job_id uuid,
  refs jsonb not null default '[]' check (jsonb_typeof(refs) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, conversation_id) references public.conversations (household_id, id) on delete cascade,
  foreign key (household_id, job_id) references public.agent_jobs (household_id, id) on delete set null (job_id),
  check (role = 'assistant' or (status = 'done' and btrim(content_md) <> '' and job_id is null))
);
create index messages_conversation_created_idx on public.messages (household_id, conversation_id, created_at);

select private.enable_household_rls('public.conversations', 'admin');
select private.enable_audit('public.conversations');
select private.enable_household_rls('public.messages', 'admin');
select private.enable_audit('public.messages');

drop policy conversations_insert on public.conversations;
drop policy conversations_update on public.conversations;
drop policy conversations_delete on public.conversations;
drop policy messages_insert on public.messages;
drop policy messages_update on public.messages;
drop policy messages_delete on public.messages;
revoke insert, update, delete on table public.conversations from authenticated;
revoke insert, update, delete on table public.messages from authenticated;

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
    else interval '10 minutes'
  end;
$$;

create function public.ask_question(p_household_id uuid, p_conversation_id uuid, p_question text, p_as_of timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_question text := btrim(coalesce(p_question, ''));
  v_question_id uuid := gen_random_uuid();
  v_answer_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
begin
  if not private.is_member(p_household_id, 'viewer') then
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;
  if v_question = '' or char_length(v_question) > 2000 then
    raise exception 'ESTA_ASK_INVALID' using errcode = '22023';
  end if;

  insert into public.conversations (id, household_id, title)
  values (p_conversation_id, p_household_id, left(regexp_replace(v_question, '\s+', ' ', 'g'), 200))
  on conflict (id) do nothing;
  if not found then
    if exists (select 1 from public.conversations c where c.id = p_conversation_id and c.household_id = p_household_id) then
      return p_conversation_id;
    end if;
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.agent_jobs (id, household_id, kind, payload, priority, idempotency_key, run_after, requested_by)
  values (
    v_job_id, p_household_id, 'ask',
    jsonb_build_object('conversation_id', p_conversation_id, 'question_id', v_question_id, 'answer_id', v_answer_id),
    10, 'ask:' || v_question_id, p_as_of, auth.uid()
  );
  insert into public.messages (id, household_id, conversation_id, role, content_md, status, created_at)
  values (v_question_id, p_household_id, p_conversation_id, 'user', v_question, 'done', p_as_of);
  insert into public.messages (id, household_id, conversation_id, role, status, job_id, created_at)
  values (v_answer_id, p_household_id, p_conversation_id, 'assistant', 'streaming', v_job_id, p_as_of + interval '1 millisecond');
  return p_conversation_id;
end;
$$;
revoke all on function public.ask_question(uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.ask_question(uuid, uuid, text, timestamptz) to authenticated;
