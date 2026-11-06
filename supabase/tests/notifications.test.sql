begin;
\ir _harness.psql

select plan(11);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
insert into public.agent_items (id, household_id, kind, severity, title, dedupe_key) values
  ('00000000-0000-4000-8000-0000000009a1', :'a', 'brief', 'info', 'Hôm nay có hai việc cần làm', 'brief:2026-10-07'),
  ('00000000-0000-4000-8000-0000000009b1', :'b', 'brief', 'info', 'Việc của nhà B', 'brief:2026-10-07');
insert into public.notifications (id, household_id, user_id, agent_item_id, channel) values
  ('00000000-0000-4000-8000-0000000009c1', :'a', tests.user_id('member.a@test.esta.test'), '00000000-0000-4000-8000-0000000009a1', 'email'),
  ('00000000-0000-4000-8000-0000000009c2', :'a', tests.user_id('admin.a@test.esta.test'), '00000000-0000-4000-8000-0000000009a1', 'email'),
  ('00000000-0000-4000-8000-0000000009c3', :'b', tests.user_id('member.b@test.esta.test'), '00000000-0000-4000-8000-0000000009b1', 'email');
select throws_ok(
  format($$ insert into public.notifications (household_id, user_id, agent_item_id, channel) values (%L, %L, '00000000-0000-4000-8000-0000000009a1', 'email') $$, :'a', tests.user_id('member.a@test.esta.test')),
  '23505', null, 'a member has at most one notice per note and channel');
select lives_ok($$ update public.notifications set status = 'sent', sent_at = now() where id = '00000000-0000-4000-8000-0000000009c1' $$,
  'the worker marks a notice sent');

select tests.act_as('member.a@test.esta.test');
select results_eq($$ select id from public.notifications $$, $$ values ('00000000-0000-4000-8000-0000000009c1'::uuid) $$,
  'a member reads only her own notice, not a housemate''s or another household''s');
select is_empty($$ select 1 from public.audit_log where table_name = 'notifications' and row_id = '00000000-0000-4000-8000-0000000009c2' $$,
  'nor the audit history of a housemate''s notice');
select isnt_empty($$ select 1 from public.audit_log where table_name = 'notifications' and row_id = '00000000-0000-4000-8000-0000000009c1' $$,
  'but the history of her own');
select throws_ok(
  format($$ insert into public.notifications (household_id, user_id, agent_item_id, channel) values (%L, %L, '00000000-0000-4000-8000-0000000009a1', 'push') $$, :'a', tests.user_id('member.a@test.esta.test')),
  '42501', null, 'a member cannot write a notice');
select throws_ok($$ update public.notifications set status = 'queued' $$, '42501', null, 'a member cannot change a notice');
select throws_ok($$ delete from public.notifications $$, '42501', null, 'a member cannot delete a notice');
select tests.sees_household('public.notifications', :'b', false);

select tests.act_as('admin.a@test.esta.test');
select results_eq($$ select id from public.notifications $$, $$ values ('00000000-0000-4000-8000-0000000009c2'::uuid) $$,
  'an admin reads her own notice only');

select tests.act_as('viewer.a@test.esta.test');
select is_empty($$ select 1 from public.notifications $$, 'a viewer with no notice reads none');

select * from finish();
rollback;
