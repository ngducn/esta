begin;
\ir _harness.psql

select plan(13);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as operator_a \gset

select set_config('esta.actor', 'system:test', true);
update public.household_members set is_operator = true where user_id = :'operator_a';
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000007a1', :'a', 'Nhà theo dõi Demo', 'WSR', 'townhouse', 'rental');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a7a1', :'a', 'individual', 'Lê Thị Thuê Demo', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, period_anchor) values
  ('00000000-0000-4000-8000-00000000e7a1', :'a', '00000000-0000-4000-8000-0000000007a1', private.whole_unit_id('00000000-0000-4000-8000-0000000007a1'),
   '00000000-0000-4000-8000-00000000a7a1', '2026-08-01', '2027-07-31', 3000000, 'calendar_month');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f07a1', :'a', '00000000-0000-4000-8000-00000000e7a1', '2026-08-01', '2026-08-31', '2026-08-01', '2026-08-01', 'issued', '2026-08-01T00:30:00+07:00');

-- The worker's service client reads what packages/ops/src/watch.ts reads.
select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
select results_eq(
  format($$ select payment_status from public.invoice_balances where household_id = %L $$, :'a'),
  $$ values ('paid') $$,
  'the service role reads an invoice balance with its payment status (no lines, so it owes nothing)');
select results_eq(
  $$ select count(*)::int, min(period_start) from public.lease_schedule(array['00000000-0000-4000-8000-00000000e7a1'::uuid], '2026-12-31') $$,
  $$ values (5, '2026-08-01'::date) $$,
  'the service role reads a lease''s periods through the year end');

-- A member of another household still reads no period of this lease.
reset role;
select tests.act_as('admin.b@test.esta.test');
select is_empty(
  $$ select 1 from public.lease_schedule(array['00000000-0000-4000-8000-00000000e7a1'::uuid], '2026-12-31') $$,
  'a member of another household reads no period');
select tests.act_as('viewer.a@test.esta.test');
select is(
  (select count(*)::int from public.lease_schedule(array['00000000-0000-4000-8000-00000000e7a1'::uuid], '2026-12-31')),
  5, 'a viewer of the household reads its periods');

-- An operator runs the watch by hand, never under a key the scheduler would give a day's job.
select tests.act_as('admin.a@test.esta.test');
select lives_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'portfolio_watch', '2026-10-07T02:00:00Z', %L) $$, :'a', :'operator_a'),
  'an operator queues portfolio_watch for itself');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by, idempotency_key)
            values (%L, 'portfolio_watch', '2026-10-07T02:00:00Z', %L, 'portfolio_watch:' || %L || ':2026-10-08') $$, :'a', :'operator_a', :'a'),
  '42501', null, 'an operator cannot take the scheduler''s key for a day');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by, idempotency_key)
            values (%L, 'ping', '2026-10-07T02:00:00Z', %L, 'portfolio_watch:' || %L || ':2026-10-08') $$, :'a', :'operator_a', :'a'),
  '42501', null, 'a ping cannot carry a key either');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'research_scan', '2026-10-07T02:00:00Z', %L) $$, :'a', :'operator_a'),
  '42501', null, 'an operator cannot queue a kind not run by hand');
select tests.act_as('member.a@test.esta.test');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'portfolio_watch', '2026-10-07T02:00:00Z', tests.user_id('member.a@test.esta.test')) $$, :'a'),
  '42501', null, 'a member who is not an operator cannot queue portfolio_watch');

reset role;
select tests.clear_request();
-- supautils' permission hint segfaults this session when it is denied a function, so grants are read, not called.
select ok(not has_function_privilege('anon', 'public.lease_schedule(uuid[], date)', 'execute'), 'a signed-out visitor cannot read periods');
select ok(not has_function_privilege('anon', 'private.payment_status(bigint, bigint)', 'execute'), 'a signed-out visitor cannot call payment_status');
select ok(not has_table_privilege('anon', 'public.invoice_balances', 'select'), 'a signed-out visitor cannot read invoice balances');
select is(private.agent_job_timeout('portfolio_watch'), interval '3 minutes', 'a stuck portfolio_watch is reclaimed after its 3 minute timeout');

select * from finish();
rollback;
