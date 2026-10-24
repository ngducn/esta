begin;
\ir _harness.psql

select plan(41);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Nhà Bán Demo', 'BAN', 'townhouse', 'held'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.tasks (id, household_id, property_id, title, due_on) values
  ('00000000-0000-4000-8000-00000000c0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'Việc của B', '2026-10-07');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
insert into public.agent_items (id, household_id, kind, severity, title, dedupe_key, proposal) values
  ('00000000-0000-4000-8000-0000000001a1', :'a', 'proposal', 'info', 'Gọi người thuê Phòng 5', 'proposal:a1',
   jsonb_build_object('type', 'create_task', 'params', jsonb_build_object(
     'title', 'Gọi người thuê Phòng 5', 'due_on', '2026-10-07', 'property_id', '00000000-0000-4000-8000-0000000000a1', 'lease_id', null))),
  ('00000000-0000-4000-8000-0000000001a2', :'a', 'proposal', 'info', 'Kiểm tra mái nhà bán', 'proposal:a2',
   jsonb_build_object('type', 'create_task', 'params', jsonb_build_object(
     'title', 'Kiểm tra mái nhà bán', 'due_on', '2026-10-08', 'property_id', '00000000-0000-4000-8000-0000000000a2', 'lease_id', null))),
  ('00000000-0000-4000-8000-0000000001a3', :'a', 'proposal', 'info', 'Việc đã bỏ qua', 'proposal:a3',
   jsonb_build_object('type', 'create_task', 'params', jsonb_build_object('title', 'Việc đã bỏ qua', 'due_on', null, 'property_id', null, 'lease_id', null))),
  ('00000000-0000-4000-8000-0000000001a4', :'a', 'proposal', 'info', 'Tham số hỏng', 'proposal:a4',
   jsonb_build_object('type', 'create_task', 'params', jsonb_build_object('title', 'Tham số hỏng'))),
  ('00000000-0000-4000-8000-0000000001a5', :'a', 'alert', 'info', 'Một ghi chú', 'note:a5', null),
  ('00000000-0000-4000-8000-0000000001b1', :'b', 'proposal', 'info', 'Đề xuất của B', 'proposal:b1',
   jsonb_build_object('type', 'create_task', 'params', jsonb_build_object('title', 'Đề xuất của B', 'due_on', null, 'property_id', null, 'lease_id', null)));

-- Plain tasks under RLS.
select tests.act_as('member.a@test.esta.test');
select lives_ok(format($$
  insert into public.tasks (id, household_id, property_id, title, due_on)
  values ('00000000-0000-4000-8000-00000000c0a1', %L, '00000000-0000-4000-8000-0000000000a1', 'Gọi bảo hiểm', '2026-10-09') $$, :'a'),
  'a member adds a task');
select is((select (source, status, created_by) from public.tasks where id = '00000000-0000-4000-8000-00000000c0a1'),
  ('user'::text, 'open'::text, :'member_a'::uuid), 'it is an open task from the user, created by her');
select tests.sees_household('public.tasks', :'a', true);
select tests.sees_household('public.tasks', :'b', false);
select tests.cannot_write('public.tasks', :'b',
  format($$ insert into public.tasks (household_id, title) values (%L, 'forged') $$, :'b'));
select throws_ok(format($$ insert into public.tasks (household_id, title, source) values (%L, 'forged', 'agent_proposal') $$, :'a'),
  '42501', null, 'a member cannot say a task came from the assistant');
select throws_ok(format($$ insert into public.tasks (household_id, title, agent_item_id) values (%L, 'forged', '00000000-0000-4000-8000-0000000001a2') $$, :'a'),
  '42501', null, 'nor tie it to a proposal');
select throws_ok($$ update public.tasks set source = 'agent_proposal' where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  '42501', null, 'nor change where it came from');
select throws_ok(format($$ insert into public.tasks (household_id, title, status) values (%L, 'x', 'later') $$, :'a'),
  '23514', null, 'a status outside open, done and dismissed is refused');
select throws_ok(format($$ insert into public.tasks (household_id, title) values (%L, '  ') $$, :'a'),
  '23514', null, 'a blank title is refused');
select lives_ok($$ update public.tasks set status = 'done' where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'a member marks it done');
select lives_ok($$ update public.tasks set status = 'open' where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'and undoes it');
select throws_ok(format($$ update public.tasks set household_id = %L where id = '00000000-0000-4000-8000-00000000c0a1' $$, :'b'),
  '23514', 'tasks rows cannot move to another household', 'a task never moves to another household');
select results_eq(
  $$ select action, actor_kind, actor_id from public.audit_log where table_name = 'tasks' and row_id = '00000000-0000-4000-8000-00000000c0a1' order by id $$,
  format($$ values ('insert', 'user', %L), ('update', 'user', %L), ('update', 'user', %L) $$, :'member_a', :'member_a', :'member_a'),
  'each write left one audit row with the member as actor');

-- Approving a proposal (AGT-6).
select throws_ok($$ update public.agent_items set status = 'approved' where id = '00000000-0000-4000-8000-0000000001a1' $$,
  '42501', null, 'a member cannot mark a proposal approved without its effect');
select is(public.approve_proposal('00000000-0000-4000-8000-0000000001a1', true), 'approved', 'a member approves the task proposal');
select results_eq(
  $$ select title, due_on, property_id, source, status from public.tasks where agent_item_id = '00000000-0000-4000-8000-0000000001a1' $$,
  $$ values ('Gọi người thuê Phòng 5'::text, '2026-10-07'::date, '00000000-0000-4000-8000-0000000000a1'::uuid, 'agent_proposal'::text, 'open'::text) $$,
  'its task carries the proposed title, due date and property');
select is((select (status, decided_by) from public.agent_items where id = '00000000-0000-4000-8000-0000000001a1'),
  ('approved'::text, :'member_a'::uuid), 'the item reads approved, decided by her');
select is(public.approve_proposal('00000000-0000-4000-8000-0000000001a1', true), 'approved', 'a second approval answers approved');
select is((select count(*)::int from public.tasks where agent_item_id = '00000000-0000-4000-8000-0000000001a1'), 1, 'and adds no second task');
select results_eq(
  $$ select table_name, action, actor_kind, actor_id from public.audit_log
     where (table_name = 'tasks' and row_id = (select id from public.tasks where agent_item_id = '00000000-0000-4000-8000-0000000001a1'))
        or (table_name = 'agent_items' and row_id = '00000000-0000-4000-8000-0000000001a1' and action = 'update')
     order by id $$,
  format($$ values ('tasks', 'insert', 'user', %L), ('agent_items', 'update', 'user', %L) $$, :'member_a', :'member_a'),
  'the audit names her as the actor of the task and of the decision');
select is_empty($$ update public.agent_items set status = 'new' where id = '00000000-0000-4000-8000-0000000001a1' returning 1 $$,
  'an approved proposal cannot be reopened by a member');
select throws_ok($$ insert into public.tasks (household_id, title, source, agent_item_id)
    select household_id, 'again', 'agent_proposal', id from public.agent_items where id = '00000000-0000-4000-8000-0000000001a1' $$,
  '42501', null, 'nor given a second task by hand');

update public.agent_items set status = 'dismissed' where id = '00000000-0000-4000-8000-0000000001a3';
select throws_ok($$ select public.approve_proposal('00000000-0000-4000-8000-0000000001a3', true) $$,
  '55000', 'ESTA_PROPOSAL_DECIDED', 'a dismissed proposal refuses approval');
select is((select count(*)::int from public.tasks where agent_item_id = '00000000-0000-4000-8000-0000000001a3'), 0, 'and makes no task');

select is(public.approve_proposal('00000000-0000-4000-8000-0000000001a4', false), 'failed', 'params the registry no longer accepts mark the item failed');
select is((select status from public.agent_items where id = '00000000-0000-4000-8000-0000000001a4'), 'failed', 'it reads failed');
select throws_ok($$ select public.approve_proposal('00000000-0000-4000-8000-0000000001a5', true) $$,
  'P0002', 'ESTA_PROPOSAL_NOT_FOUND', 'a note that is not a proposal cannot be approved');
select throws_ok($$ select public.approve_proposal('00000000-0000-4000-8000-0000000001b1', true) $$,
  'P0002', 'ESTA_PROPOSAL_NOT_FOUND', 'a proposal of another household cannot be approved');
select is((select status from public.agent_items where id = '00000000-0000-4000-8000-0000000001b1'), null, 'and its item stays out of sight');

-- A subject gone since the proposal: the item fails and nothing else is written.
select tests.clear_request();
reset role;
select set_config('esta.actor', 'system:test', true);
update public.properties set deleted_at = now() where id = '00000000-0000-4000-8000-0000000000a2';
select tests.act_as('viewer.a@test.esta.test');
select throws_ok($$ select public.approve_proposal('00000000-0000-4000-8000-0000000001a2', true) $$,
  'P0002', 'ESTA_PROPOSAL_NOT_FOUND', 'a viewer cannot approve, even calling the function herself');
select is_empty($$ update public.agent_items set status = 'dismissed' where id = '00000000-0000-4000-8000-0000000001a2' returning 1 $$,
  'nor dismiss');
select tests.sees_household('public.tasks', :'a', true);
select tests.cannot_write('public.tasks', :'a', format($$ insert into public.tasks (household_id, title) values (%L, 'x') $$, :'a'));
select tests.act_as('member.a@test.esta.test');
select is(public.approve_proposal('00000000-0000-4000-8000-0000000001a2', true), 'failed', 'a proposal about an archived property fails');
select is((select count(*)::int from public.tasks where agent_item_id = '00000000-0000-4000-8000-0000000001a2'), 0, 'and makes no task');

select is(has_function_privilege('anon', 'public.approve_proposal(uuid, boolean)', 'execute'), false, 'an anonymous caller cannot approve');

select * from finish();
rollback;
