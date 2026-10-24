begin;
\ir _harness.psql

select plan(3);

select tests.create_household('a') as a \gset
select tests.user_id('admin.a@test.esta.test') as operator_a \gset

select is(private.agent_job_timeout('morning_brief'), interval '3 minutes', 'a stuck morning_brief is reclaimed after its 3 minute timeout');
select is(private.agent_job_timeout('portfolio_watch'), interval '3 minutes', 'portfolio_watch keeps its 3 minute timeout');

select set_config('esta.actor', 'system:test', true);
update public.household_members set is_operator = true where user_id = :'operator_a';
select tests.act_as('admin.a@test.esta.test');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'morning_brief', '2026-10-07T00:00:00Z', %L) $$, :'a', :'operator_a'),
  '42501', null, 'even an operator cannot queue a morning_brief; only the scheduler does');

select * from finish();
rollback;
