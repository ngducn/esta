begin;
\ir _harness.psql

select plan(38);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);
-- The claim takes the first claimable job of any household, so the seed's own queue stays out of the way.
update public.agent_jobs set status = 'cancelled' where status in ('queued', 'running');

-- Caps as data
select is(private.agent_daily_cap(:'a', 'ask'), 60, 'an ask cap defaults to 60 a day');
select is(private.agent_daily_cap(:'a', 'extract_document'), 30, 'an extraction cap defaults to 30');
select is(private.agent_daily_cap(:'a', 'research_scan'), 2, 'a research scan cap defaults to 2');
select is(private.agent_daily_cap(:'a', 'weekly_review'), 1, 'a weekly review cap defaults to 1');
select is(private.agent_daily_cap(:'a', 'portfolio_watch'), null, 'a kind with no cap row is not capped');
update public.household_settings set agent = '{"daily_caps": {"ask": 2}}' where household_id = :'a';
select is(private.agent_daily_cap(:'a', 'ask'), 2, 'household_settings.agent.daily_caps overrides the default');
select is(private.agent_daily_cap(:'b', 'ask'), 60, 'for that household only');
update public.household_settings set agent = '{"daily_caps": {"ask": "5"}}' where household_id = :'b';
select is(private.agent_daily_cap(:'b', 'ask'), 60, 'a text override keeps the default');
update public.household_settings set agent = '{"daily_caps": {"ask": 1.5}}' where household_id = :'b';
select is(private.agent_daily_cap(:'b', 'ask'), 60, 'so does a fraction');
update public.household_settings set agent = '{"daily_caps": {"ask": 1001}}' where household_id = :'b';
select is(private.agent_daily_cap(:'b', 'ask'), 60, 'and a value over 1000');
update public.household_settings set agent = '{"daily_caps": {"ask": 0}}' where household_id = :'b';
select is(private.agent_daily_cap(:'b', 'ask'), 0, 'zero stops the kind for the household');
update public.household_settings set agent = '{}' where household_id = :'b';

-- Three questions in household a, which allows two asks a day.
select tests.act_as('viewer.a@test.esta.test');
select tests.ask_question(:'a', ('00000000-0000-4000-8000-00000000ca0' || n)::uuid, ('00000000-0000-4000-8000-00000000cb0' || n)::uuid, 'Câu hỏi ' || n, false, '2026-10-07 09:00+07')
from generate_series(1, 3) n;
select tests.act_as('viewer.b@test.esta.test');
select tests.ask_question(:'b', '00000000-0000-4000-8000-0000000cc001', '00000000-0000-4000-8000-0000000cd001', 'Câu hỏi b', false, '2026-10-07 09:00+07');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
select is((select count(*)::int from public.claim_agent_job('w1', '2026-10-07 09:00+07')), 1, 'the first ask is claimed');
select is((select count(*)::int from public.claim_agent_job('w1', '2026-10-07 09:00+07')), 1, 'so is the second');
select is((select count(*)::int from public.claim_agent_job('w1', '2026-10-07 09:00+07')), 1, 'the next claim passes over the third and takes household b''s ask');
select results_eq(
  $$ select household_id::text, status from public.agent_jobs where kind = 'ask' and payload ->> 'conversation_id' like '00000000-0000-4000-8000-0000000_c%' order by household_id = $$ || quote_literal(:'b') || $$, status $$,
  format($$ values (%L, 'queued'), (%L, 'running'), (%L, 'running'), (%L, 'running') $$, :'a', :'a', :'a', :'b'),
  'household a runs its two, household b its one, and a''s third waits');
select results_eq(
  $$ select j.run_after, m.deferred_until, m.status, m.content_md
     from public.agent_jobs j join public.messages m on m.id = (j.payload ->> 'answer_id')::uuid
     where j.kind = 'ask' and j.status = 'queued' and j.payload ->> 'conversation_id' like '00000000-0000-4000-8000-0000000_c%' $$,
  $$ values ('2026-10-08 00:00+07'::timestamptz, '2026-10-08 00:00+07'::timestamptz, 'streaming', '') $$,
  'the third waits for the next local midnight, and its answer row says so with no text of its own');
update public.agent_jobs set status = 'done' where status = 'running';
select is((select count(*)::int from public.claim_agent_job('w1', '2026-10-07 23:59+07')), 0, 'nothing more runs that day');
select is((select count(*)::int from public.claim_agent_job('w1', '2026-10-08 00:00+07')), 1, 'at midnight the third question runs');

-- A crashed job the claim takes back counts once, as itself.
update public.agent_jobs set status = 'running', locked_at = '2026-10-08 00:00+07', started_at = '2026-10-08 00:00+07' where kind = 'ask' and payload ->> 'conversation_id' = '00000000-0000-4000-8000-00000000ca03';
update public.household_settings set agent = '{"daily_caps": {"ask": 1}}' where household_id = :'a';
select is(
  (select attempts::int from public.claim_agent_job('w2', '2026-10-08 00:07+07')),
  2, 'a stuck ask is reclaimed though its own first attempt already used the day''s one slot');

update public.agent_jobs set status = 'done' where status = 'running';

-- A cap of one: the second worker's claim the same day finds the first one's start.
update public.household_settings set agent = '{"daily_caps": {"extract_document": 1}}' where household_id = :'a';
insert into public.agent_jobs (household_id, kind, run_after, idempotency_key)
select :'a', 'extract_document', '2026-10-09 09:00+07', 'cap-race-' || n from generate_series(1, 2) n;
select is((select count(*)::int from public.claim_agent_job('w1', '2026-10-09 09:00+07')), 1, 'one extraction runs');
select is((select count(*)::int from public.claim_agent_job('w2', '2026-10-09 09:00+07')), 0, 'the other waits for tomorrow');
select is((select run_after from public.agent_jobs where idempotency_key like 'cap-race-%' and status = 'queued'), '2026-10-10 00:00+07'::timestamptz, 'at the next local midnight');

-- Members read the paused state beside last_seen_at, and never the host.
select ok(has_column_privilege('authenticated', 'public.worker_heartbeats', 'state', 'select'), 'members read the worker state');
select ok(not has_column_privilege('authenticated', 'public.worker_heartbeats', 'host_label', 'select'), 'and still not the host');
select throws_ok($$ insert into public.worker_heartbeats (worker_id, host_label, version, auth_mode, agent_mode, last_seen_at, state) values (gen_random_uuid(), 'h', '1', 'none', 'replay', now(), 'asleep') $$, '23514', null, 'the state is ok or usage_limited');

-- Thử lại
insert into public.agent_jobs (id, household_id, kind, run_after, status, attempts, idempotency_key, priority)
values ('00000000-0000-4000-8000-00000000fa01', :'a', 'portfolio_watch', '2026-10-07 06:40+07', 'failed', 4, 'portfolio_watch:' || :'a' || ':2026-10-07', 200);
insert into public.agent_items (id, household_id, kind, severity, audience, title, proposal, dedupe_key, job_id)
values ('00000000-0000-4000-8000-00000000fb01', :'a', 'alert', 'info', 'all', 'Trợ lý chưa xem được danh mục hôm nay',
        '{"type": "retry_job", "params": {"job_id": "00000000-0000-4000-8000-00000000fa01"}, "min_role": "admin"}', 'job_failed:00000000-0000-4000-8000-00000000fa01', '00000000-0000-4000-8000-00000000fa01');

select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select public.retry_agent_job('00000000-0000-4000-8000-00000000fb01') $$, 'P0002', 'ESTA_RETRY_NOT_FOUND', 'a member who is not an admin cannot retry');
select tests.act_as('admin.b@test.esta.test');
select throws_ok($$ select public.retry_agent_job('00000000-0000-4000-8000-00000000fb01') $$, 'P0002', 'ESTA_RETRY_NOT_FOUND', 'nor can another household''s admin');
select tests.act_as('admin.a@test.esta.test');
select lives_ok($$ select public.retry_agent_job('00000000-0000-4000-8000-00000000fb01') $$, 'an admin taps Thử lại');
select lives_ok($$ select public.retry_agent_job('00000000-0000-4000-8000-00000000fb01') $$, 'and taps it again');
select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
select results_eq(
  format($$ select idempotency_key, status, attempts::int, priority::int, requested_by = tests.user_id('admin.a@test.esta.test') from public.agent_jobs where idempotency_key like %L $$, 'portfolio_watch:' || :'a' || ':2026-10-07:retry:%'),
  format($$ values (%L, 'queued', 0, 200, true) $$, 'portfolio_watch:' || :'a' || ':2026-10-07:retry:1'),
  'the two taps queue one fresh job, keyed retry 1, as the admin');
select results_eq(
  $$ select status, decided_by = tests.user_id('admin.a@test.esta.test') from public.agent_items where id = '00000000-0000-4000-8000-00000000fb01' $$,
  $$ values ('done', true) $$, 'and the item reads done');

update public.agent_jobs set status = 'failed' where idempotency_key = 'portfolio_watch:' || :'a' || ':2026-10-07:retry:1';
insert into public.agent_items (id, household_id, kind, severity, audience, title, proposal, dedupe_key)
select '00000000-0000-4000-8000-00000000fb02', :'a', 'alert', 'info', 'all', 'Trợ lý chưa xem được danh mục hôm nay',
       jsonb_build_object('type', 'retry_job', 'params', jsonb_build_object('job_id', id), 'min_role', 'admin'), 'job_failed:' || id
from public.agent_jobs where idempotency_key = 'portfolio_watch:' || :'a' || ':2026-10-07:retry:1';
select tests.act_as('admin.a@test.esta.test');
select lives_ok($$ select public.retry_agent_job('00000000-0000-4000-8000-00000000fb02') $$, 'the failed retry has its own Thử lại');
select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
select is(
  (select count(*)::int from public.agent_jobs where idempotency_key = 'portfolio_watch:' || :'a' || ':2026-10-07:retry:2'),
  1, 'which queues retry 2 of the same job');

-- A job that has not failed is not retried.
insert into public.agent_jobs (id, household_id, kind, run_after, status, idempotency_key)
values ('00000000-0000-4000-8000-00000000fa03', :'a', 'morning_brief', '2026-10-07 07:00+07', 'done', 'brief-done');
insert into public.agent_items (id, household_id, kind, severity, title, proposal, dedupe_key)
values ('00000000-0000-4000-8000-00000000fb03', :'a', 'alert', 'info', 'Xong', '{"type": "retry_job", "params": {"job_id": "00000000-0000-4000-8000-00000000fa03"}, "min_role": "admin"}', 'retry-done');
select tests.act_as('admin.a@test.esta.test');
select throws_ok($$ select public.retry_agent_job('00000000-0000-4000-8000-00000000fb03') $$, '55000', 'ESTA_RETRY_NOT_FAILED', 'a job that did not fail has nothing to retry');
-- Calling a function the role may not execute crashes the local Postgres (#128), so the grant is read instead.
select ok(not has_function_privilege('authenticated', 'public.claim_agent_job(text, timestamptz)', 'execute'), 'no member claims a job, so none skips a cap');

-- An extraction's retry reads a new extraction row, which the document shows as the newest.
reset role;
select tests.clear_request();
select set_config('esta.actor', 'system:test', true);
insert into public.documents (id, household_id, category, title, storage_path, mime, sha256, size_bytes, sensitivity)
values ('00000000-0000-4000-8000-00000000fd01', :'a', 'certificate', 'Sổ hồng', :'a' || '/00000000-0000-4000-8000-00000000fd01/so.pdf', 'application/pdf', repeat('a', 64), 10, 'normal');
insert into public.agent_jobs (id, household_id, kind, run_after, status, attempts, payload, idempotency_key)
values ('00000000-0000-4000-8000-00000000fa04', :'a', 'extract_document', '2026-10-07 09:00+07', 'failed', 4,
        '{"document_id": "00000000-0000-4000-8000-00000000fd01", "extraction_id": "00000000-0000-4000-8000-00000000fe01"}', 'extract_document:00000000-0000-4000-8000-00000000fd01:' || repeat('a', 64));
insert into public.document_extractions (id, household_id, document_id, schema_name, schema_version, job_id)
values ('00000000-0000-4000-8000-00000000fe01', :'a', '00000000-0000-4000-8000-00000000fd01', 'certificate_v1', 1, '00000000-0000-4000-8000-00000000fa04');
update public.document_extractions set status = 'failed' where id = '00000000-0000-4000-8000-00000000fe01';
insert into public.agent_items (id, household_id, kind, severity, title, proposal, dedupe_key)
values ('00000000-0000-4000-8000-00000000fb04', :'a', 'alert', 'info', 'Chưa đọc được', '{"type": "retry_job", "params": {"job_id": "00000000-0000-4000-8000-00000000fa04"}, "min_role": "admin"}', 'extract_failed:fe01');
select tests.act_as('admin.a@test.esta.test');
select lives_ok($$ select public.retry_agent_job('00000000-0000-4000-8000-00000000fb04') $$, 'an admin retries a failed extraction');
-- As the owner: a direct call of a private function from another role crashes the local Postgres (#128).
reset role;
select tests.clear_request();
select results_eq(
  $$ select x.status, x.job_id = j.id, j.payload ->> 'extraction_id' = x.id::text, j.payload ->> 'document_id'
     from public.document_extractions x join public.agent_jobs j on j.idempotency_key like 'extract_document:00000000-0000-4000-8000-00000000fd01:%:retry:1'
     where x.id = private.latest_extraction(x.household_id, '00000000-0000-4000-8000-00000000fd01') $$,
  $$ values ('queued', true, true, '00000000-0000-4000-8000-00000000fd01') $$,
  'the retry reads into a new queued extraction, the document''s newest');
update public.agent_items set status = 'new' where id = '00000000-0000-4000-8000-00000000fb04';
select tests.act_as('admin.a@test.esta.test');
select throws_ok($$ select public.retry_agent_job('00000000-0000-4000-8000-00000000fb04') $$, '55000', 'ESTA_RETRY_NOT_FAILED', 'once a newer read exists, the failed one is not read again');

select * from finish();
rollback;
