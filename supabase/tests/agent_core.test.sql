begin;
\ir _harness.psql

select plan(30);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as operator_a \gset
select tests.user_id('admin.b@test.esta.test') as operator_b \gset

select set_config('esta.actor', 'system:test', true);
update public.household_members set is_operator = true where user_id in (:'operator_a', :'operator_b');
insert into public.household_members (household_id, user_id, invited_email, role)
values (:'a', tests.create_user('admin2.a@test.esta.test'), 'admin2.a@test.esta.test', 'admin');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
insert into public.agent_jobs (id, household_id, kind, run_after, status)
values ('00000000-0000-0000-0000-0000000000b1', :'b', 'ping', '2026-10-07T02:00:00Z', 'done');
insert into public.agent_runs (household_id, job_id, auth_mode, agent_mode, started_at)
values (:'b', '00000000-0000-0000-0000-0000000000b1', 'none', 'replay', '2026-10-07T02:00:00Z');
insert into public.agent_jobs (id, household_id, kind, run_after, status)
values ('00000000-0000-0000-0000-0000000000a1', :'a', 'ping', '2026-10-07T02:00:00Z', 'done');
insert into public.agent_runs (household_id, job_id, auth_mode, agent_mode, started_at)
values (:'a', '00000000-0000-0000-0000-0000000000a1', 'none', 'replay', '2026-10-07T02:00:00Z');
insert into public.worker_heartbeats (worker_id, host_label, version, auth_mode, agent_mode, last_seen_at)
values ('mac-mini', 'Mac mini', '0.0.0', 'subscription', 'live', '2026-10-07T02:00:00Z');
select results_eq(
  $$ select actor_kind, actor_id from public.audit_log where table_name = 'agent_jobs' order by id limit 1 $$,
  $$ values ('agent', 'test-worker') $$,
  'a worker write is audited under its x-esta-actor');

select tests.act_as('admin.a@test.esta.test');
select tests.sees_household('public.agent_jobs', :'a', true);
select tests.sees_household('public.agent_runs', :'a', true);
select tests.sees_household('public.agent_jobs', :'b', false);
select tests.sees_household('public.agent_runs', :'b', false);

select lives_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'ping', '2026-10-07T02:00:00Z', %L) $$, :'a', :'operator_a'),
  'an operator queues a ping for itself');
select results_eq(
  format($$ select status, attempts::int, created_by from public.agent_jobs where requested_by = %L $$, :'operator_a'),
  format($$ values ('queued', 0, %L::uuid) $$, :'operator_a'),
  'the ping starts queued with no attempt');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'extract_document', '2026-10-07T02:00:00Z', %L) $$, :'a', :'operator_a'),
  '42501', null, 'an operator cannot queue another kind');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'ping', '2026-10-07T02:00:00Z', tests.user_id('viewer.a@test.esta.test')) $$, :'a'),
  '42501', null, 'an operator cannot queue a ping for someone else');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'ping', '2026-10-07T02:00:00Z', %L) $$, :'b', :'operator_a'),
  '42501', null, 'an operator cannot queue a ping in another household');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by, status, result)
            values (%L, 'ping', '2026-10-07T02:00:00Z', %L, 'done', '{"reply": "forged"}') $$, :'a', :'operator_a'),
  '42501', null, 'an operator cannot set the status or the result');
select throws_ok(
  $$ update public.agent_jobs set status = 'cancelled' $$,
  '42501', null, 'an operator cannot update a job');
select throws_ok(
  $$ delete from public.agent_jobs $$,
  '42501', null, 'an operator cannot delete a job');
select throws_ok(
  format($$ insert into public.agent_runs (household_id, job_id, auth_mode, agent_mode, started_at)
            values (%L, '00000000-0000-0000-0000-0000000000a1', 'none', 'replay', '2026-10-07T02:00:00Z') $$, :'a'),
  '42501', null, 'an operator cannot write a run');

select tests.act_as('admin2.a@test.esta.test');
select tests.sees_household('public.agent_jobs', :'a', false);
select tests.sees_household('public.agent_runs', :'a', false);
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'ping', '2026-10-07T02:00:00Z', tests.user_id('admin2.a@test.esta.test')) $$, :'a'),
  '42501', null, 'a non-operator admin cannot queue a ping');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.agent_jobs', :'a', false);
select tests.sees_household('public.agent_runs', :'a', false);
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'ping', '2026-10-07T02:00:00Z', tests.user_id('viewer.a@test.esta.test')) $$, :'a'),
  '42501', null, 'a viewer cannot queue a ping');
select results_eq(
  $$ select worker_id, last_seen_at from public.worker_heartbeats $$,
  $$ values ('mac-mini', '2026-10-07T02:00:00Z'::timestamptz) $$,
  'a member reads the worker id and the last heartbeat');
select throws_ok(
  $$ select auth_mode from public.worker_heartbeats $$,
  '42501', null, 'a member cannot read the auth mode');
select throws_ok(
  $$ insert into public.worker_heartbeats (worker_id, host_label, version, auth_mode, agent_mode, last_seen_at)
     values ('fake', 'Fake', '0', 'none', 'replay', '2026-10-07T02:00:00Z') $$,
  '42501', null, 'a member cannot write a heartbeat');

reset role;
select tests.clear_request();
-- Postgres 17.6.1.106 segfaults on SET ROLE plus a denied function call, so the grant is read instead of called.
select ok(not has_function_privilege('authenticated', 'public.claim_agent_job(text, timestamptz)', 'execute'),
  'a member cannot claim a job');
select ok(not has_function_privilege('anon', 'public.claim_agent_job(text, timestamptz)', 'execute'),
  'a signed-out visitor cannot claim a job');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
update public.agent_jobs set status = 'done' where status = 'queued';
insert into public.agent_jobs (id, household_id, kind, run_after, priority)
values ('00000000-0000-0000-0000-0000000000a2', :'a', 'ping', '2026-10-07T02:00:00Z', 100),
       ('00000000-0000-0000-0000-0000000000a3', :'a', 'ping', '2026-10-07T01:00:00Z', 100),
       ('00000000-0000-0000-0000-0000000000a4', :'a', 'ping', '2026-10-07T03:00:00Z', 100);

select results_eq(
  $$ select id, locked_by, attempts::int from public.claim_agent_job('w1', '2026-10-07T02:30:00Z') $$,
  $$ values ('00000000-0000-0000-0000-0000000000a3'::uuid, 'w1', 1) $$,
  'the first claim takes the oldest due job');
select results_eq(
  $$ select id, locked_by from public.claim_agent_job('w2', '2026-10-07T02:30:00Z') $$,
  $$ values ('00000000-0000-0000-0000-0000000000a2'::uuid, 'w2') $$,
  'a second claim takes a different job');
select is_empty(
  $$ select 1 from public.claim_agent_job('w3', '2026-10-07T02:30:00Z') $$,
  'a job whose run_after is later than the as-of date stays queued');
select is_empty(
  $$ select 1 from public.claim_agent_job('w3', '2026-10-07T02:33:00Z') $$,
  'a running ping is not reclaimed within its 1 minute timeout plus 2 minutes');
select results_eq(
  $$ select id, locked_by, attempts::int from public.claim_agent_job('w3', '2026-10-07T02:33:01Z') $$,
  $$ values ('00000000-0000-0000-0000-0000000000a3'::uuid, 'w3', 2) $$,
  'a stale running ping is reclaimed after 3 minutes with a new attempt');

select * from finish();
rollback;
