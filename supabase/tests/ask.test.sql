begin;
\ir _harness.psql

select plan(39);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);

select tests.act_as('viewer.a@test.esta.test');
select is(
  tests.ask_question(:'a', '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000c0b1', '  Tháng này thu được bao nhiêu từ Dĩ An?  ', false, '2026-10-07 09:00+07'),
  '00000000-0000-4000-8000-00000000c0a1'::uuid, 'a viewer asks a question in a new conversation');
select results_eq(
  $$ select role, content_md, status, job_id is null from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1' order by created_at $$,
  $$ values ('user', 'Tháng này thu được bao nhiêu từ Dĩ An?', 'done', true), ('assistant', '', 'streaming', false) $$,
  'the question is saved trimmed, then an empty answer row that streams');
select is((select title from public.conversations where id = '00000000-0000-4000-8000-00000000c0a1'), 'Tháng này thu được bao nhiêu từ Dĩ An?', 'the question titles the conversation');
select is(
  tests.ask_question(:'a', '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000c0b1', 'Tháng này thu được bao nhiêu từ Dĩ An?', false, '2026-10-07 09:00+07'),
  '00000000-0000-4000-8000-00000000c0a1'::uuid, 'a second tap on the same send answers it');
select is((select count(*)::int from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1'), 2, 'and adds no message');
select throws_ok(
  format($$ select tests.ask_question(%L, gen_random_uuid(), gen_random_uuid(), '   ', false, '2026-10-07 09:00+07') $$, :'a'),
  '22023', 'ESTA_ASK_INVALID', 'a blank question is refused');
select throws_ok(
  format($$ select tests.ask_question(%L, gen_random_uuid(), gen_random_uuid(), %L, false, '2026-10-07 09:00+07') $$, :'a', repeat('a', 2001)),
  '22023', 'ESTA_ASK_INVALID', 'so is one over two thousand characters');
select throws_ok(
  format($$ select tests.ask_question(%L, gen_random_uuid(), gen_random_uuid(), 'Câu hỏi', false, '2026-10-07 09:00+07') $$, :'b'),
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

select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  format($$ select tests.ask_question(%L, '00000000-0000-4000-8000-00000000c0a1', gen_random_uuid(), 'Còn tháng 9 thì sao?', true, '2026-10-07 09:00+07') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'only an operator asks with the deep model, whatever the page shows');
select is(
  tests.ask_question(:'a', '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000c0b2', 'Còn tháng 9 thì sao?', false, '2026-10-07 09:00+07'),
  '00000000-0000-4000-8000-00000000c0a1'::uuid, 'a follow-up joins the conversation');
select results_eq(
  $$ select role, content_md, status from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1' order by created_at $$,
  $$ values ('user', 'Tháng này thu được bao nhiêu từ Dĩ An?', 'done'), ('assistant', 'Tháng này đã thu.', 'done'), ('user', 'Còn tháng 9 thì sao?', 'done'), ('assistant', '', 'streaming') $$,
  'it reads after the first answer, though the frozen clock asked both at one instant');
select is(
  (select last_asked_at from public.conversations where id = '00000000-0000-4000-8000-00000000c0a1'),
  (select created_at from public.messages where id = '00000000-0000-4000-8000-00000000c0b2'),
  'the conversation lists as asked when the follow-up was');
select throws_ok(
  format($$ select tests.ask_question(%L, '00000000-0000-4000-8000-00000000c0a1', gen_random_uuid(), 'Câu thứ ba', false, '2026-10-07 09:00+07') $$, :'a'),
  '55000', 'ESTA_ASK_BUSY', 'another question waits until the follow-up is answered');
select is(
  tests.ask_question(:'a', '00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000c0b2', 'Còn tháng 9 thì sao?', false, '2026-10-07 09:00+07'),
  '00000000-0000-4000-8000-00000000c0a1'::uuid, 'resending the follow-up while it streams adds nothing');
select throws_ok(
  format($$ select tests.ask_question(%L, gen_random_uuid(), '00000000-0000-4000-8000-00000000c0b2', 'Câu hỏi', false, '2026-10-07 09:00+07') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'a question id already used in another conversation is refused');
-- Calling a function the role may not execute crashes the local Postgres (#128), so the grant is read instead.
select ok(not has_function_privilege('authenticated', 'public.finish_answer(uuid, uuid, text, jsonb, integer, text, text)', 'execute'), 'no member finishes an answer');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
select is((select count(*)::int from public.agent_jobs where payload ->> 'conversation_id' = '00000000-0000-4000-8000-00000000c0a1'), 2, 'one job per question');
select lives_ok(
  format($$ select public.finish_answer(%L, (select id from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1' and status = 'streaming'), 'Tháng 9 đã thu.', '[]', 16, 'session-2', repeat('a', 64)) $$, :'a'),
  'the worker finishes the follow-up');
select results_eq(
  $$ select sdk_session_id, sdk_turn_hash, sdk_handles from public.conversations where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  $$ values ('session-2', repeat('a', 64), 16) $$,
  'and hands its session to the next question in the same write');
select throws_ok(
  format($$ select public.finish_answer(%L, (select id from public.messages where conversation_id = '00000000-0000-4000-8000-00000000c0a1' and role = 'assistant' order by created_at desc limit 1), 'again', '[]', 20, 'session-3', repeat('b', 64)) $$, :'a'),
  'P0002', 'ESTA_ANSWER_NOT_STREAMING', 'an answer finishes once');

reset role;
select tests.clear_request();
update public.household_members set is_operator = true where user_id = tests.user_id('admin.a@test.esta.test');
select tests.act_as('admin.a@test.esta.test');
select is(
  tests.ask_question(:'a', '00000000-0000-4000-8000-00000000c0a3', gen_random_uuid(), 'Câu hỏi khó', true, '2026-10-07 09:00+07'),
  '00000000-0000-4000-8000-00000000c0a3'::uuid, 'an operator asks with the deep model');
select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
select is((select payload ->> 'deep' from public.agent_jobs where payload ->> 'conversation_id' = '00000000-0000-4000-8000-00000000c0a3'), 'true', 'and the job says so');

select tests.act_as('member.b@test.esta.test');
select tests.sees_household('public.conversations', :'a', false);
select tests.sees_household('public.messages', :'a', false);

select tests.act_as('member.a@test.esta.test');
select is_empty($$ select 1 from public.conversations $$, 'a member reads no conversation another member started');
select is_empty($$ select 1 from public.messages $$, 'nor its messages');
select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.messages', :'a', true);

reset role;
select tests.clear_request();
delete from public.notification_preferences where member_id = (select id from public.household_members where user_id = tests.user_id('member.a@test.esta.test'));
delete from public.household_members where user_id = tests.user_id('member.a@test.esta.test');
select tests.act_as('member.a@test.esta.test');
select tests.sees_household('public.conversations', :'a', false);
select tests.sees_household('public.messages', :'a', false);
select throws_ok(
  format($$ select tests.ask_question(%L, gen_random_uuid(), gen_random_uuid(), 'Câu hỏi', false, '2026-10-07 09:00+07') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'a member removed from the household reads none of its conversations and asks nothing');

select tests.act_as('admin.a@test.esta.test');
select throws_ok($$ update public.messages set content_md = 'forged' $$, '42501', null, 'no member edits an answer, not even an admin');
select throws_ok(
  format($$ insert into public.conversations (household_id, title) values (%L, 'forged') $$, :'a'),
  '42501', null, 'nor starts a conversation outside ask_question');
select throws_ok($$ delete from public.conversations $$, '42501', null, 'nor deletes one');

select * from finish();
rollback;
