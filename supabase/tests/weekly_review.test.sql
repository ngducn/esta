begin;
\ir _harness.psql

select plan(9);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);
update public.household_members set is_operator = true where user_id = tests.user_id('admin.a@test.esta.test');
insert into public.worker_heartbeats (worker_id, host_label, version, auth_mode, agent_mode, last_seen_at) values
  ('6f1c2a4e-0b7d-4f6a-9c1e-2d3b4a5c6d7e', 'mac-mini', '0.1.0', 'api_key', 'live', '2026-10-11T00:00:00Z'),
  ('7f1c2a4e-0b7d-4f6a-9c1e-2d3b4a5c6d7e', 'mac-mini', '0.1.0', 'subscription', 'replay', '2026-10-11T01:00:00Z');

select lives_ok(
  format($$ insert into public.agent_items (household_id, kind, severity, title, dedupe_key) values (%L, 'weekly', 'info', 'Tuần này', 'weekly_review:2026-W41') $$, :'a'),
  'the weekly review stores a note of kind weekly'
);
select throws_ok(
  format($$ insert into public.agent_items (household_id, kind, severity, title, dedupe_key) values (%L, 'monthly', 'info', 'Tháng này', 'monthly:2026-10') $$, :'a'),
  '23514', null, 'a kind outside the list is refused'
);

select tests.act_as('admin.a@test.esta.test');
select results_eq(
  format($$ select auth_mode, agent_mode from public.worker_modes(%L, '2026-10-11T01:00:00Z') $$, :'a'),
  $$ values ('subscription', 'replay') $$,
  'an operator reads the newest heartbeat''s modes'
);
select results_eq(
  format($$ select auth_mode, agent_mode from public.worker_modes(%L, '2026-10-11T00:30:00Z') $$, :'a'),
  $$ values ('api_key', 'live') $$,
  'as of the clock, not a heartbeat beaten after it'
);
select is_empty(format($$ select * from public.worker_modes(%L, '2026-10-11T01:00:00Z') $$, :'b'), 'not for a household the operator is not an operator of');
select throws_ok($$ select auth_mode from public.worker_heartbeats $$, '42501', null, 'and members still cannot read the modes from the table');

select tests.act_as('admin.b@test.esta.test');
select is_empty(format($$ select * from public.worker_modes(%L, '2026-10-11T01:00:00Z') $$, :'b'), 'an admin who is not an operator reads no modes');

select tests.act_as('viewer.a@test.esta.test');
select is_empty(format($$ select * from public.worker_modes(%L, '2026-10-11T01:00:00Z') $$, :'a'), 'nor does a viewer of the operator''s household');

select tests.clear_request();
select ok(not has_function_privilege('anon', 'public.worker_modes(uuid, timestamptz)', 'execute'), 'anon cannot call it');

select * from finish();
rollback;
