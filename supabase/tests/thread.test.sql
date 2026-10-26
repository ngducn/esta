begin;
\ir _harness.psql

select plan(46);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
delete from public.test_clock;
insert into public.test_clock (frozen_now) values ('2026-10-07T09:00:00+07:00');


select tests.act_as('member.a@test.esta.test');
select isnt(public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0001', 'Tháng này thu được bao nhiêu từ Dĩ An?'), null, 'a member sends her first message');
reset role;
select conversation_id as seg1 from public.messages where id = '00000000-0000-4000-8000-0000000f0001' \gset
select tests.act_as('member.a@test.esta.test');
select results_eq(
  format($$ select role, status, created_at from public.messages where conversation_id = %L order by created_at $$, :'seg1'),
  $$ values ('user', 'done', '2026-10-07T09:00:00+07:00'::timestamptz), ('assistant', 'streaming', '2026-10-07T09:00:00.001+07:00'::timestamptz) $$,
  'it is asked at the test clock''s time, with no date from the caller');
select throws_ok(
  format($$ select public.ask_in_thread(%L, gen_random_uuid(), 'Còn tháng 9 thì sao?') $$, :'a'),
  '55000', 'ESTA_ASK_BUSY', 'a message while the answer still streams is refused as busy');
select is(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0001', 'Tháng này thu được bao nhiêu từ Dĩ An?'),
  :'seg1'::uuid, 'a resent tap returns its segment, even while it streams');
select is((select count(*)::int from public.messages where household_id = :'a'), 2, 'and asks once');

reset role;
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and role = 'assistant' and status = 'streaming';
select tests.act_as('member.a@test.esta.test');
select is(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0002', 'Còn tháng 9 thì sao?'),
  :'seg1'::uuid, 'a second question on the same business day joins the segment');
select is(
  (select count(*)::int from public.messages where conversation_id = :'seg1' and role = 'user'), 2,
  'and holds both questions');

select tests.act_as('admin.a@test.esta.test');
select isnt(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0003', 'Hợp đồng nào hết hạn?'),
  :'seg1'::uuid, 'another member of the household never joins her segment');
reset role;
select conversation_id as seg_admin from public.messages where id = '00000000-0000-4000-8000-0000000f0003' \gset
select tests.act_as('admin.a@test.esta.test');
select is((select count(*)::int from public.conversations), 1, 'and reads only the conversation she started');
select is((select count(*)::int from public.messages), 2, 'and only its messages');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0001', 'Tháng này thu được bao nhiêu từ Dĩ An?') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'a question id another member saved is refused');
select throws_ok(
  format($$ select public.ask_in_thread(%L, gen_random_uuid(), 'Suy nghĩ kỹ hơn', true) $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'an admin who is not an operator cannot ask with the deep model');
reset role;
update public.household_members set is_operator = true where user_id = tests.user_id('admin.a@test.esta.test');
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and role = 'assistant' and status = 'streaming';
select tests.act_as('admin.a@test.esta.test');
select is(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0004', 'Suy nghĩ kỹ hơn', true),
  :'seg_admin'::uuid, 'an operator asks with the deep model in her own segment');
select tests.act_as_service();
select is((select (payload ->> 'deep')::boolean from public.agent_jobs where idempotency_key = 'ask:00000000-0000-4000-8000-0000000f0004'), true, 'and the job runs on the deep model');

select tests.act_as('viewer.a@test.esta.test');
select isnt(public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0005', 'Tổng tiền cọc là bao nhiêu?'), null, 'a viewer may send a message');
select throws_ok(
  format($$ select public.ask_in_thread(%L, gen_random_uuid(), 'Câu hỏi', true) $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'but not with the deep model');
select throws_ok(
  format($$ insert into public.messages (household_id, conversation_id, role, content_md, status) values (%L, %L, 'user', 'x', 'done') $$, :'a', :'seg1'),
  '42501', null, 'but writes no message itself');
select ok(not has_function_privilege('authenticated', 'public.ask_question(uuid, uuid, uuid, text, boolean, timestamptz, uuid, uuid)', 'execute'),
  'no client calls ask_question, so none picks a conversation or a date');

select tests.act_as('member.b@test.esta.test');
select throws_ok(
  format($$ select public.ask_in_thread(%L, gen_random_uuid(), 'Câu hỏi') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'a member of another household is refused');
select is((select count(*)::int from public.messages where household_id = :'a'), 0, 'and reads none of its messages');

select tests.act_as_service();
update public.test_clock set frozen_now = '2026-10-08T00:05:00+07:00';
select tests.act_as('member.a@test.esta.test');
select isnt(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0006', 'Còn tháng 8 thì sao?'),
  :'seg1'::uuid, 'moving the test clock to the next day starts a new segment');
select is(
  (select created_at from public.messages where id = '00000000-0000-4000-8000-0000000f0006'), '2026-10-08T00:05:00+07:00'::timestamptz,
  'asked at the moved clock');
select is(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0002', 'Còn tháng 9 thì sao?'),
  :'seg1'::uuid, 'a resend after midnight still returns the segment that holds it');
select is((select count(*)::int from public.conversations), 2, 'she now has two segments');

reset role;
select conversation_id as seg3 from public.messages where id = '00000000-0000-4000-8000-0000000f0006' \gset
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and role = 'assistant' and status = 'streaming';
select set_config('request.jwt.claims', jsonb_build_object('sub', tests.user_id('member.a@test.esta.test'), 'role', 'authenticated')::text, true);
insert into public.messages (household_id, conversation_id, role, content_md, status, created_at)
select :'a', :'seg3'::uuid, role, 'Câu ' || n, 'done', '2026-10-08T00:05:00+07:00'::timestamptz + n * interval '1 second'
from generate_series(1, 19) n, (values ('user'), ('assistant')) r (role);
select tests.act_as('member.a@test.esta.test');
select is((select count(*)::int from public.messages where conversation_id = :'seg3'::uuid and role = 'user'), 20, 'the new segment holds twenty questions');
select isnt(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0007', 'Câu hai mươi mốt'),
  :'seg3'::uuid, 'the twenty-first question starts a new segment on the same day');
select is((select count(*)::int from public.conversations), 3, 'so she has three');

select tests.act_as('admin.a@test.esta.test');
select is((select count(*)::int from public.conversations), 1, 'the other member still reads only her own');
reset role;
select is(
  (select count(*)::int from public.agent_jobs where kind = 'ask' and household_id = :'a'), 7,
  'one job per question asked, none for the resends');

-- Topics (P5-13): a reply to a note or a question about a property.
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and role = 'assistant' and status = 'streaming';
select conversation_id as seg4 from public.messages where id = '00000000-0000-4000-8000-0000000f0007' \gset
insert into public.agent_items (id, household_id, kind, severity, audience, title, dedupe_key) values
  ('00000000-0000-4000-8000-0000000f0a01', :'a', 'alert', 'action', 'all', 'Phòng 5 quá hạn', 'topic:a:all'),
  ('00000000-0000-4000-8000-0000000f0a02', :'a', 'system', 'info', 'operator', 'Ryan đăng nhập lại', 'topic:a:operator'),
  ('00000000-0000-4000-8000-0000000f0b01', :'b', 'alert', 'action', 'all', 'Nhà khác quá hạn', 'topic:b:all');
insert into public.properties (id, household_id, nickname, code, kind, use_mode, deleted_at) values
  ('00000000-0000-4000-8000-0000000f0a11', :'a', 'Đất Bảo Lộc', 'BL', 'agricultural_land', 'held', null),
  ('00000000-0000-4000-8000-0000000f0a12', :'a', 'Nhà cũ', 'CU', 'townhouse', 'rental', '2026-09-01T00:00:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0b11', :'b', 'Nhà khác', 'NK', 'townhouse', 'rental', null);

select tests.act_as('member.a@test.esta.test');
select isnt(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0101', 'Khách này trễ mấy lần rồi?', false, '{"kind": "item", "id": "00000000-0000-4000-8000-0000000f0a01"}'),
  :'seg4'::uuid, 'a reply to a note starts a new segment on the same business day, so the topic leads');
select results_eq(
  $$ select topic_item_id, topic_property_id from public.messages where id = '00000000-0000-4000-8000-0000000f0101' $$,
  $$ values ('00000000-0000-4000-8000-0000000f0a01'::uuid, null::uuid) $$,
  'her message keeps the note it replies to');
select conversation_id as seg_reply from public.messages where id = '00000000-0000-4000-8000-0000000f0101' \gset
select is(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0101', 'Khách này trễ mấy lần rồi?', false, '{"kind": "item", "id": "00000000-0000-4000-8000-0000000f0a01"}'),
  :'seg_reply'::uuid, 'a resent reply returns its segment');
reset role;
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and role = 'assistant' and status = 'streaming';
select tests.act_as('member.a@test.esta.test');
select is(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0102', 'Còn năm ngoái thì sao?'),
  :'seg_reply'::uuid, 'her next message without a topic joins the conversation the reply started');
select is(
  (select count(*)::int from public.messages where id = '00000000-0000-4000-8000-0000000f0102' and topic_item_id is null and topic_property_id is null), 1,
  'and has no topic');
reset role;
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and role = 'assistant' and status = 'streaming';
select tests.act_as('member.a@test.esta.test');
select isnt(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0103', 'Tài sản này đang thế chấp ở đâu?', false, '{"kind": "property", "id": "00000000-0000-4000-8000-0000000f0a11"}'),
  :'seg_reply'::uuid, 'a question about a property starts its own segment');
select results_eq(
  $$ select topic_item_id, topic_property_id from public.messages where id = '00000000-0000-4000-8000-0000000f0103' $$,
  $$ values (null::uuid, '00000000-0000-4000-8000-0000000f0a11'::uuid) $$,
  'and keeps the property it is about');
reset role;
update public.messages set content_md = 'Đã trả lời.', status = 'done' where household_id = :'a' and role = 'assistant' and status = 'streaming';

select tests.act_as('member.a@test.esta.test');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0201', 'Câu hỏi', false, '{"kind": "item", "id": "00000000-0000-4000-8000-0000000f0b01"}') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'a reply to another household''s note is refused');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0202', 'Câu hỏi', false, '{"kind": "item", "id": "00000000-0000-4000-8000-0000000f0a02"}') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'a reply to an operator note is refused to a member, who cannot read it');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0203', 'Câu hỏi', false, '{"kind": "property", "id": "00000000-0000-4000-8000-0000000f0a12"}') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'a question about an archived property is refused');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0204', 'Câu hỏi', false, '{"kind": "property", "id": "00000000-0000-4000-8000-0000000f0b11"}') $$, :'a'),
  '42501', 'ESTA_FORBIDDEN', 'a question about another household''s property is refused');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0205', 'Câu hỏi', false, '{"kind": "lease", "id": "00000000-0000-4000-8000-0000000f0a01"}') $$, :'a'),
  '22023', 'ESTA_ASK_INVALID', 'a forged kind is refused');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0206', 'Câu hỏi', false, '{"kind": "item", "id": "00000000-0000-4000-8000-0000000f0a01", "audience": "all"}') $$, :'a'),
  '22023', 'ESTA_ASK_INVALID', 'a topic with any other field is refused');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0207', 'Câu hỏi', false, '{"kind": "item", "id": "Phòng 5"}') $$, :'a'),
  '22023', 'ESTA_ASK_INVALID', 'a topic whose id is not a uuid is refused');
select throws_ok(
  format($$ select public.ask_in_thread(%L, '00000000-0000-4000-8000-0000000f0208', 'Câu hỏi', false, '"item"') $$, :'a'),
  '22023', 'ESTA_ASK_INVALID', 'a topic that is not an object is refused');
reset role;
select is(
  (select count(*)::int from public.messages where id::text like '00000000-0000-4000-8000-0000000f02%'), 0,
  'no refused topic writes a message');

select tests.act_as('admin.a@test.esta.test');
select isnt(
  public.ask_in_thread(:'a', '00000000-0000-4000-8000-0000000f0301', 'Đăng nhập lại thế nào?', false, '{"kind": "item", "id": "00000000-0000-4000-8000-0000000f0a02"}'),
  null, 'an operator replies to an operator note');

select * from finish();
rollback;
