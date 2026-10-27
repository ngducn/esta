-- Trợ lý is one thread per member (AGENT.md §5.6). Her questions live in conversations she started, and each
-- conversation is a segment of her thread that bounds one SDK session. A member reads only her own segments; the
-- household's notes stay in agent_items.
alter policy conversations_select on public.conversations
  using ((select private.is_member(household_id, 'viewer')) and created_by = (select auth.uid()));
alter policy messages_select on public.messages
  using ((select private.is_member(household_id, 'viewer')) and created_by = (select auth.uid()));

create index conversations_creator_asked_idx on public.conversations (household_id, created_by, last_asked_at desc);

-- Sends one message in the member's thread and returns the conversation it joined. The clock is the database's, so no
-- caller can ask as of a future date and hold a conversation busy until then (#340). private.audit_now() honors the
-- test_clock row on a seeded stack, as the meter and lease bill previews do, but not ESTA_FROZEN_NOW, which only the
-- web and the worker read: a stack frozen through ESTA_FROZEN_NOW alone splits segments by the real date.
create function public.ask_in_thread(p_household_id uuid, p_question_id uuid, p_question text, p_deep boolean default false)
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
begin
  if v_user is null or not private.is_member(p_household_id, 'viewer') then
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;
  -- Two sends of one member pick their segment one at a time, so both join the same one.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ask_in_thread:' || p_household_id || ':' || v_user, 0));

  -- A resent tap goes back to the segment that holds its question, even after midnight, so ask_question returns at once.
  select m.conversation_id into v_conversation
  from public.messages m
  where m.id = p_question_id and m.household_id = p_household_id and m.role = 'user' and m.created_by = v_user;

  if v_conversation is null then
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

  return public.ask_question(p_household_id, coalesce(v_conversation, gen_random_uuid()), p_question_id, p_question, p_deep, v_now);
end;
$$;
revoke all on function public.ask_in_thread(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.ask_in_thread(uuid, uuid, text, boolean) to authenticated;

-- Only ask_in_thread picks a conversation, so no client can join one another member started or ask as of another date.
revoke execute on function public.ask_question(uuid, uuid, uuid, text, boolean, timestamptz) from authenticated;
