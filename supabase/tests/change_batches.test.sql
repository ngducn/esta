begin;
\ir _harness.psql

select plan(27);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as admin_a \gset

create temporary table batch_sql (insert_a text);
insert into batch_sql values (format(
  $$ insert into public.change_batches (id, household_id, summary, plan, planned_at)
     values ('00000000-0000-4000-8000-0000000000c1', %L, 'Thêm Nhà Demo', '{"items": []}', '2026-10-07T02:00:00Z') $$, :'a'));
grant select on batch_sql to authenticated;

select tests.act_as('admin.a@test.esta.test');
select throws_ok((select insert_a from batch_sql), '42501', null, 'an admin who is not the operator cannot plan a batch');
reset role;

select set_config('esta.actor', 'system:test', true);
update public.household_members set is_operator = true where user_id in (:'admin_a', tests.user_id('admin.b@test.esta.test'));

select tests.act_as('member.a@test.esta.test');
select throws_ok((select insert_a from batch_sql), '42501', null, 'a member cannot plan a batch');

select tests.act_as('admin.a@test.esta.test');
select lives_ok((select insert_a from batch_sql), 'the operator plans a batch');
reset role;
select is((select actor_kind || ':' || actor_id || ':' || action from public.audit_log where table_name = 'change_batches' order by id desc limit 1),
  'user:' || :'admin_a' || ':insert', 'planning is audited as the operator');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.change_batches', :'a', true);
select is_empty($$ update public.change_batches set status = 'applying', applied_at = '2026-10-07T02:05:00Z' returning 1 $$,
  'a viewer cannot claim a batch');

select tests.act_as('admin.b@test.esta.test');
select tests.sees_household('public.change_batches', :'a', false);
select tests.cannot_write('public.change_batches', :'a', (select insert_a from batch_sql));

select tests.act_as('admin.a@test.esta.test');
select throws_ok($$ update public.change_batches set plan = '{"items": [1]}' $$, '23514', 'ESTA_BATCH_FROZEN',
  'the approved plan never changes');
select throws_ok($$ update public.change_batches set planned_at = '2026-10-07T03:00:00Z' $$, '23514', 'ESTA_BATCH_FROZEN',
  'a plan cannot be given more time');
select throws_ok($$ update public.change_batches set status = 'applied', applied_at = '2026-10-07T02:05:00Z', outcomes = '[]' $$,
  '23514', 'ESTA_BATCH_TRANSITION', 'a planned batch is claimed before it is applied');
select isnt_empty($$ update public.change_batches set status = 'applying', applied_at = '2026-10-07T02:05:00Z'
  where id = '00000000-0000-4000-8000-0000000000c1' and status = 'planned' returning 1 $$, 'the first apply claims the batch');
select is_empty($$ update public.change_batches set status = 'applying', applied_at = '2026-10-07T02:06:00Z'
  where id = '00000000-0000-4000-8000-0000000000c1' and status = 'planned' returning 1 $$, 'a second apply finds nothing to claim');
select isnt_empty($$ update public.change_batches set applied_at = '2026-10-07T02:11:00Z'
  where id = '00000000-0000-4000-8000-0000000000c1' and status = 'applying' and applied_at <= '2026-10-07T02:06:00Z' returning 1 $$,
  'a later apply takes over a claim a crash abandoned');
select throws_ok($$ update public.change_batches set status = 'planned', applied_at = null $$, '23514', 'ESTA_BATCH_TRANSITION',
  'a claimed batch is never planned again');
select throws_ok($$ update public.change_batches set status = 'applied' $$, '23514', null,
  'a finished batch records what landed');
select lives_ok($$ update public.change_batches set status = 'partial', outcomes = '[{"index": 0, "status": "refused"}]' $$,
  'the batch ends partial with what landed');
select throws_ok($$ update public.change_batches set outcomes = '[]' $$, '23514', 'ESTA_BATCH_FROZEN', 'what landed is never rewritten');
select throws_ok($$ update public.change_batches set status = 'applying' $$, '23514', 'ESTA_BATCH_TRANSITION',
  'a finished batch is never claimed again');
select is_empty($$ delete from public.change_batches returning 1 $$, 'nobody deletes a batch');

select throws_ok(format($$ insert into public.change_batches (household_id, summary, plan, planned_at, via)
  values (%L, 'x', '{}', '2026-10-07T02:00:00Z', 'web') $$, :'a'), '23514', null, 'only Claude plans batches');
select throws_ok(format($$ insert into public.change_batches (household_id, summary, plan, planned_at, applied_at)
  values (%L, 'x', '{}', '2026-10-07T02:00:00Z', '2026-10-07T02:10:00Z') $$, :'a'), '23514', null, 'a planned batch has no applied_at');
select throws_ok(format($$ insert into public.change_batches (household_id, summary, plan, planned_at)
  values (%L, ' ', '{}', '2026-10-07T02:00:00Z') $$, :'a'), '23514', null, 'a batch has a summary');
select lives_ok(format($$ insert into public.change_batches (id, household_id, summary, plan, planned_at)
  values ('00000000-0000-4000-8000-0000000000c2', %L, 'Sửa Nhà Demo', '{"items": []}', '2026-10-07T02:00:00Z') $$, :'a'),
  'the operator plans a second batch');
reset role;

update public.household_members set role = 'admin', is_operator = true where user_id = tests.user_id('member.a@test.esta.test');
select tests.act_as('member.a@test.esta.test');
select is_empty($$ update public.change_batches set status = 'applying', applied_at = '2026-10-07T02:05:00Z'
  where id = '00000000-0000-4000-8000-0000000000c2' returning 1 $$, 'another operator cannot apply a batch Ryan planned');
reset role;

select * from finish();
rollback;
