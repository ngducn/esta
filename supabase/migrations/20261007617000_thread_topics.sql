-- Her message can be about one note Trợ lý left or one property of the household (P5-13, AGENT.md §5.6 step 1). Two
-- columns with foreign keys rather than one jsonb, so the database itself keeps a topic inside the household.
alter table public.messages
  add column topic_item_id uuid,
  add column topic_property_id uuid,
  add constraint messages_topic_item_fkey foreign key (household_id, topic_item_id) references public.agent_items (household_id, id) on delete set null (topic_item_id),
  add constraint messages_topic_property_fkey foreign key (household_id, topic_property_id) references public.properties (household_id, id) on delete set null (topic_property_id),
  add constraint messages_one_topic check (num_nonnulls(topic_item_id, topic_property_id) <= 1),
  add constraint messages_topic_on_question check (role = 'user' or num_nonnulls(topic_item_id, topic_property_id) = 0);

drop function public.ask_in_thread(uuid, uuid, text, boolean);
drop function public.ask_question(uuid, uuid, uuid, text, boolean, timestamptz);

-- As 20261007615100_thread_privacy.sql, and her message keeps the topic ask_in_thread checked.
create function public.ask_question(
  p_household_id uuid, p_conversation_id uuid, p_question_id uuid, p_question text, p_deep boolean, p_as_of timestamptz, p_topic_item_id uuid, p_topic_property_id uuid
)
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
  insert into public.messages (id, household_id, conversation_id, role, content_md, status, created_at, topic_item_id, topic_property_id)
  values (p_question_id, p_household_id, p_conversation_id, 'user', v_question, 'done', v_asked_at, p_topic_item_id, p_topic_property_id);
  insert into public.messages (id, household_id, conversation_id, role, status, job_id, created_at)
  values (v_answer_id, p_household_id, p_conversation_id, 'assistant', 'streaming', v_job_id, v_asked_at + interval '1 millisecond');
  return p_conversation_id;
end;
$$;
revoke all on function public.ask_question(uuid, uuid, uuid, text, boolean, timestamptz, uuid, uuid) from public, anon, authenticated;

-- The topic is `{"kind": "item" | "property", "id": uuid}`. A note must be one the caller reads (an operator note
-- only for an operator) and a property one of the household's live properties, so a topic never names a record she
-- cannot open. A message with a topic starts a new segment, so the topic leads its conversation [app rule].
create function public.ask_in_thread(p_household_id uuid, p_question_id uuid, p_question text, p_deep boolean default false, p_topic jsonb default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_now timestamptz := private.audit_now();
  v_conversation uuid;
  v_last_asked timestamptz;
  v_topic_id uuid;
  v_item uuid;
  v_property uuid;
begin
  if v_user is null or not private.is_member(p_household_id, 'viewer') then
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ask_in_thread:' || p_household_id || ':' || v_user, 0));

  select m.conversation_id into v_conversation
  from public.messages m
  where m.id = p_question_id and m.household_id = p_household_id and m.role = 'user' and m.created_by = v_user;

  if v_conversation is null and p_topic is not null then
    if jsonb_typeof(p_topic) <> 'object'
      or (select count(*) from jsonb_object_keys(p_topic)) <> 2
      or coalesce(p_topic ->> 'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'ESTA_ASK_INVALID' using errcode = '22023';
    end if;
    v_topic_id := (p_topic ->> 'id')::uuid;
    case p_topic ->> 'kind'
      when 'item' then
        select i.id into v_item from public.agent_items i
        where i.household_id = p_household_id and i.id = v_topic_id and (i.audience = 'all' or private.is_operator(p_household_id));
        if v_item is null then
          raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
        end if;
      when 'property' then
        select p.id into v_property from public.properties p
        where p.household_id = p_household_id and p.id = v_topic_id and p.deleted_at is null;
        if v_property is null then
          raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
        end if;
      else
        raise exception 'ESTA_ASK_INVALID' using errcode = '22023';
    end case;
  elsif v_conversation is null then
    select c.id, c.last_asked_at into v_conversation, v_last_asked
    from public.conversations c
    where c.household_id = p_household_id and c.created_by = v_user
    order by c.last_asked_at desc, c.id desc
    limit 1;
    -- [app rule] A segment holds one business day and at most 20 questions, which also caps how long its transcript grows.
    if v_conversation is not null and (
      private.business_date(v_last_asked) <> private.business_date(v_now)
      or (select count(*) from public.messages m where m.household_id = p_household_id and m.conversation_id = v_conversation and m.role = 'user') >= 20
    ) then
      v_conversation := null;
    end if;
  end if;

  return public.ask_question(p_household_id, coalesce(v_conversation, gen_random_uuid()), p_question_id, p_question, p_deep, v_now, v_item, v_property);
end;
$$;
revoke all on function public.ask_in_thread(uuid, uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.ask_in_thread(uuid, uuid, text, boolean, jsonb) to authenticated;
