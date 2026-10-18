begin;
\ir _harness.psql

select plan(12);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);
update public.household_members set is_operator = true where user_id = tests.user_id('admin.a@test.esta.test');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
insert into public.agent_items (id, household_id, kind, severity, audience, title, dedupe_key) values
  ('00000000-0000-4000-8000-0000000001a1', :'a', 'alert', 'info', 'all', 'Đã đọc xong Sổ hồng A. Mời bạn kiểm tra lại.', 'extract_review:a'),
  ('00000000-0000-4000-8000-0000000001a2', :'a', 'system', 'info', 'operator', 'Number guard failed', 'guard:a'),
  ('00000000-0000-4000-8000-0000000001b1', :'b', 'alert', 'info', 'all', 'Đã đọc xong Sổ hồng B. Mời bạn kiểm tra lại.', 'extract_review:b');
select throws_ok(
  format($$ insert into public.agent_items (household_id, kind, severity, title, dedupe_key) values (%L, 'alert', 'info', 'again', 'extract_review:a') $$, :'a'),
  '23505', null, 'the dedupe key is unique per household');

select tests.act_as('member.a@test.esta.test');
select results_eq($$ select title from public.agent_items order by title $$, $$ values ('Đã đọc xong Sổ hồng A. Mời bạn kiểm tra lại.') $$,
  'a member sees her household''s items for all and no operator item');
select is_empty($$ select 1 from public.audit_log where table_name = 'agent_items' and row_id = '00000000-0000-4000-8000-0000000001a2' $$,
  'nor the audit history of an operator item');
select isnt_empty($$ select 1 from public.audit_log where table_name = 'agent_items' and row_id = '00000000-0000-4000-8000-0000000001a1' $$,
  'but the history of an item for all');
select results_eq($$ update public.agent_items set status = 'read' returning id $$, $$ values ('00000000-0000-4000-8000-0000000001a1'::uuid) $$,
  'a member marks her item read and touches no operator item');
select throws_ok($$ update public.agent_items set title = 'forged' $$, '42501', null, 'a member changes only the status');
select throws_ok(
  format($$ insert into public.agent_items (household_id, kind, severity, title, dedupe_key) values (%L, 'alert', 'info', 'forged', 'forged') $$, :'a'),
  '42501', null, 'a member cannot write an item');
select throws_ok($$ delete from public.agent_items $$, '42501', null, 'a member cannot delete an item');
select tests.sees_household('public.agent_items', :'b', false);

select tests.act_as('admin.a@test.esta.test');
select is((select count(*)::int from public.agent_items), 2, 'an operator sees operator items too');
select isnt_empty($$ select 1 from public.audit_log where table_name = 'agent_items' and row_id = '00000000-0000-4000-8000-0000000001a2' $$,
  'and their history');

select tests.act_as('viewer.a@test.esta.test');
select is_empty($$ update public.agent_items set status = 'dismissed' returning 1 $$, 'a viewer cannot change an item');

select * from finish();
rollback;
