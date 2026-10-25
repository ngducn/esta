begin;
\ir _harness.psql

select plan(19);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);

select tests.act_as('viewer.a@test.esta.test');
select is(
  public.ask_question(:'a', '00000000-0000-4000-8000-00000000c0a1', '  Tháng này thu được bao nhiêu từ Dĩ An?  ', '2026-10-07 09:00+07'),
  '00000000-0000-4000-8000-00000000c0a1'::uuid, 'a viewer asks a question in a new conversation');
select results_eq(
  $$ select role, content_md, status, job_id is null from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1' order by created_at $$,
  $$ values ('user', 'Tháng này thu được bao nhiêu từ Dĩ An?', 'done', true), ('assistant', '', 'streaming', false) $$,
  'the question is saved trimmed, then an empty answer row that streams');
select is((select title from public.conversations where id = '00000000-0000-4000-8000-00000000c0a1'), 'Tháng này thu được bao nhiêu từ Dĩ An?', 'the question titles the conversation');
select is(
  public.ask_question(:'a', '00000000-0000-4000-8000-00000000c0a1', 'Tháng này thu được bao nhiêu từ Dĩ An?', '2026-10-07 09:00+07'),
  '00000000-0000-4000-8000-00000000c0a1'::uuid, 'a second tap with the same conversation id answers it');
select is((select count(*)::int from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1'), 2, 'and adds no message');
select throws_ok(
  format($$ select public.ask_question(%L, gen_random_uuid(), '   ', '2026-10-07 09:00+07') $$, :'a'),
  '22023', 'ESTA_ASK_INVALID', 'a blank question is refused');
select throws_ok(
  format($$ select public.ask_question(%L, gen_random_uuid(), %L, '2026-10-07 09:00+07') $$, :'a', repeat('a', 2001)),
  '22023', 'ESTA_ASK_INVALID', 'so is one over two thousand characters');
select throws_ok(
  format($$ select public.ask_question(%L, gen_random_uuid(), 'Câu hỏi', '2026-10-07 09:00+07') $$, :'b'),
  '42501', 'ESTA_FORBIDDEN', 'nobody asks in a household they are not a member of');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
select results_eq(
  $$ select kind, priority::int, idempotency_key = 'ask:' || (payload ->> 'question_id'), run_after = '2026-10-07 09:00+07', requested_by = tests.user_id('viewer.a@test.esta.test')
     from public.agent_jobs where payload ->> 'conversation_id' = '00000000-0000-4000-8000-00000000c0a1' $$,
  $$ values ('ask', 10, true, true, true) $$,
  'one ask job, keyed by the question, runs ahead of the daily jobs as of the clock');
select is(
  (select payload ->> 'answer_id' from public.agent_jobs where payload ->> 'conversation_id' = '00000000-0000-4000-8000-00000000c0a1'),
  (select id::text from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1' and role = 'assistant'),
  'the job names the answer row it streams into');
update public.messages set content_md = 'Tháng này đã thu.', status = 'done' where conversation_id = '00000000-0000-4000-8000-00000000c0a1' and role = 'assistant';
select is((select status from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1' and role = 'assistant'), 'done', 'the worker writes the answer');
select throws_ok(
  format($$ insert into public.messages (household_id, conversation_id, role, status) values (%L, '00000000-0000-4000-8000-00000000c0a1', 'user', 'streaming') $$, :'a'),
  '23514', null, 'a question is never saved blank or streaming');
select isnt_empty($$ select 1 from public.audit_log where table_name = 'messages' $$, 'every answer write is audited');
select is(private.agent_job_timeout('ask'), interval '4 minutes', 'an ask job is reclaimed only after its answer and its repair turn could both have run (AGENT.md §3)');

select tests.act_as('member.b@test.esta.test');
select tests.sees_household('public.conversations', :'a', false);
select tests.sees_household('public.messages', :'a', false);

select tests.act_as('admin.a@test.esta.test');
select throws_ok($$ update public.messages set content_md = 'forged' $$, '42501', null, 'no member edits an answer, not even an admin');
select throws_ok(
  format($$ insert into public.conversations (household_id, title) values (%L, 'forged') $$, :'a'),
  '42501', null, 'nor starts a conversation outside ask_question');
select throws_ok($$ delete from public.conversations $$, '42501', null, 'nor deletes one');

select * from finish();
rollback;
