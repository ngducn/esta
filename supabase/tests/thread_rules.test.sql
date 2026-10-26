begin;
\ir _harness.psql

select plan(16);

select tests.create_household('a') as a \gset
select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
delete from public.test_clock;
insert into public.test_clock (frozen_now) values ('2026-10-07T09:00:00+07:00');

-- Sends n questions as the member, each answered before the next, the way she would on a frozen clock.
create function pg_temp.ask_answered(p_household uuid, p_email text, p_count int)
returns void
language plpgsql
as $$
begin
  for n in 1..p_count loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', tests.user_id(p_email), 'role', 'authenticated')::text, true);
    perform public.ask_in_thread(p_household, gen_random_uuid(), 'Câu ' || n);
    perform set_config('request.jwt.claims', '', true);
    update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = p_household and status = 'streaming';
  end loop;
end;
$$;

-- The history of her question and its answer stays hers (#347, fix round 1).
select tests.act_as('member.a@test.esta.test');
select isnt(public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000fa001', 'Tiền cọc Dĩ An còn bao nhiêu?'), null, 'a member asks a question');
select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
update public.messages set content_md = 'Tiền cọc Dĩ An đã đủ.', status = 'done' where household_id = :'a' and role = 'assistant' and status = 'streaming';
reset role;
update public.household_members set is_operator = true where user_id = tests.user_id('admin.a@test.esta.test');

select tests.act_as('member.a@test.esta.test');
select is(
  (select count(*)::int from public.audit_log where table_name in ('conversations', 'messages') and diff::text like '%Dĩ An%'), 3,
  'she reads the history of her conversation, her question and the answer written to it');
select tests.act_as('admin.a@test.esta.test');
select is_empty(
  $$ select 1 from public.audit_log where table_name in ('conversations', 'messages') $$,
  'an operator of the household reads none of it');
select tests.act_as('viewer.a@test.esta.test');
select is_empty(
  $$ select 1 from public.audit_log where table_name in ('conversations', 'messages') $$,
  'nor does a viewer');
select isnt_empty(
  $$ select 1 from public.audit_log where table_name = 'household_members' $$,
  'who still reads the rest of the household''s history');

-- One answer at a time across her whole thread.
reset role;
update public.test_clock set frozen_now = '2026-10-07T23:50:00+07:00';
select tests.act_as('member.a@test.esta.test');
select isnt(public.ask_in_thread(:'a', gen_random_uuid(), 'Câu lúc khuya'), null, 'she asks at 23:50');
reset role;
update public.test_clock set frozen_now = '2026-10-08T00:01:00+07:00';
select tests.act_as('member.a@test.esta.test');
select throws_ok(
  format($$ select public.ask_in_thread(%L, gen_random_uuid(), 'Câu sau nửa đêm') $$, :'a'),
  '55000', 'ESTA_ASK_BUSY', 'a message after midnight waits while the 23:50 answer still streams');
reset role;
select is((select count(*)::int from public.messages where household_id = :'a' and status = 'streaming'), 1, 'so only one answer streams');
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and status = 'streaming';

update public.test_clock set frozen_now = '2026-10-09T08:00:00+07:00';
select pg_temp.ask_answered(:'a', 'member.a@test.esta.test', 19);
select tests.act_as('member.a@test.esta.test');
select conversation_id as day2 from public.messages where role = 'user' order by created_at desc limit 1 \gset
select is((select count(*)::int from public.messages where conversation_id = :'day2' and role = 'user'), 19, 'the new day''s segment holds nineteen questions');
select is(public.ask_in_thread(:'a', gen_random_uuid(), 'Câu hai mươi'), :'day2'::uuid, 'the twentieth joins it and streams');
select throws_ok(
  format($$ select public.ask_in_thread(%L, gen_random_uuid(), 'Câu hai mươi mốt') $$, :'a'),
  '55000', 'ESTA_ASK_BUSY', 'the twenty-first waits for it rather than streaming beside it in a new segment');

-- On a frozen clock every send in a full segment stamps a millisecond later; the next segment still follows it.
reset role;
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and status = 'streaming';
select tests.act_as('member.a@test.esta.test');
select isnt(public.ask_in_thread(:'a', gen_random_uuid(), 'Câu hai mươi mốt'), :'day2'::uuid, 'once it is answered, the twenty-first opens a segment');
reset role;
select conversation_id as day2b from public.messages where role = 'user' order by created_at desc limit 1 \gset
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and status = 'streaming';
select tests.act_as('member.a@test.esta.test');
select is(public.ask_in_thread(:'a', gen_random_uuid(), 'Câu hai mươi hai'), :'day2b'::uuid, 'the twenty-second joins that segment on the still frozen clock');
select ok(
  (select min(created_at) from public.messages where conversation_id = :'day2b') > (select max(created_at) from public.messages where conversation_id = :'day2'),
  'and its messages follow the full segment''s in the thread');
select is(
  (select id from public.conversations where id <> :'day2b' order by last_asked_at desc limit 1), :'day2'::uuid,
  'the full segment is the one before it, which seeds its first turn');
select is((select count(*)::int from public.conversations), 3, 'she has a segment for 7 October and two for 9 October');

select * from finish();
rollback;
