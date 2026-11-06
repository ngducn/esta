begin;
\ir _harness.psql

select plan(14);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as operator_a \gset
select tests.user_id('admin.b@test.esta.test') as operator_b \gset

select set_config('esta.actor', 'system:test', true);
update public.household_members set is_operator = true where user_id in (:'operator_a', :'operator_b');

delete from public.cron_runs;

select tests.act_as_service();
select lives_ok($$ insert into public.cron_runs (job, started_at, finished_at, ok, households_processed)
  values ('invoices', '2026-10-07T17:30:00Z', '2026-10-07T17:30:04Z', true, 3) $$, 'the service role records a run');
select lives_ok($$ insert into public.cron_runs (job, started_at, finished_at, ok, failure, households_processed, households_failed)
  values ('invoices', '2026-10-08T17:30:00Z', '2026-10-08T17:30:02Z', false, '1 households failed', 2, 1),
         ('keep_alive', '2026-10-08T01:00:00Z', '2026-10-08T01:00:00Z', true, null, 0, 0) $$, 'the service role records a failed run and another job');
select throws_ok($$ insert into public.cron_runs (job, started_at, finished_at, ok) values ('backup', now(), now(), true) $$,
  '23514', null, 'an unknown job is refused');
select throws_ok($$ insert into public.cron_runs (job, started_at, finished_at, ok, failure) values ('invoices', now(), now(), false, null) $$,
  '23514', null, 'a failed run must say why');
select throws_ok($$ insert into public.cron_runs (job, started_at, finished_at, ok) values ('invoices', now(), now() - interval '1 second', true) $$,
  '23514', null, 'a run cannot finish before it starts');
select throws_ok($$ update public.cron_runs set ok = true $$, '42501', null, 'the service role cannot rewrite history');
reset role;

select tests.act_as('admin.a@test.esta.test');
select results_eq(
  format($$ select job, ok from public.cron_job_status(%L) order by job $$, :'a'),
  $$ values ('invoices', false), ('keep_alive', true) $$,
  'an operator reads the latest run of each job');
select is_empty(format($$ select 1 from public.cron_job_status(%L) $$, :'b'), 'an operator of another household reads nothing through that household');
select throws_ok($$ select count(*) from public.cron_runs $$, '42501', null, 'the table itself is closed to a signed-in member');
reset role;

select tests.act_as('member.a@test.esta.test');
select is_empty(format($$ select 1 from public.cron_job_status(%L) $$, :'a'), 'a member who is not the operator reads nothing');
select throws_ok($$ insert into public.cron_runs (job, started_at, finished_at, ok) values ('invoices', now(), now(), true) $$,
  '42501', null, 'a member cannot write a run');
reset role;

select tests.act_as('viewer.a@test.esta.test');
select is_empty(format($$ select 1 from public.cron_job_status(%L) $$, :'a'), 'a viewer reads nothing');
reset role;

set local role anon;
select throws_ok($$ select count(*) from public.cron_runs $$, '42501', null, 'anon cannot read the table');
reset role;
select ok(not has_function_privilege('anon', 'public.cron_job_status(uuid)', 'execute'), 'anon cannot call the status function');

select * from finish();
rollback;
