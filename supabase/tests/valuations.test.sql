begin;
\ir _harness.psql

select plan(24);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Đất Bảo Lộc', 'BL', 'residential_land', 'held'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.valuations (id, household_id, property_id, as_of, value_vnd, method) values
  ('00000000-0000-4000-8000-00000000f0b1', :'b', '00000000-0000-4000-8000-0000000000b1', '2026-07-01', 5000000000, 'owner_estimate');

select tests.act_as('member.a@test.esta.test');
select lives_ok(format($$
  insert into public.valuations (id, household_id, property_id, as_of, value_vnd, method, source_url, note)
  values ('00000000-0000-4000-8000-00000000f0a1', %L, '00000000-0000-4000-8000-0000000000a1', '2026-10-07', 9500000000,
          'broker_quote', 'https://example.com/bao-gia', 'Môi giới Demo báo giá') $$, :'a'),
  'a member of A records a broker quote with its source');
select lives_ok(format($$
  insert into public.valuations (id, household_id, property_id, as_of, value_vnd, method)
  values ('00000000-0000-4000-8000-00000000f0a1', %L, '00000000-0000-4000-8000-0000000000a1', '2026-10-07', 9500000000, 'broker_quote')
  on conflict (id) do nothing $$, :'a'),
  'saving the same id again converges');
select is((select count(*)::int from public.valuations where id = '00000000-0000-4000-8000-00000000f0a1'), 1, 'a retried save leaves one row');
select is((select created_by from public.valuations where id = '00000000-0000-4000-8000-00000000f0a1'), :'member_a'::uuid, 'created_by is the member');

select tests.sees_household('public.valuations', :'a', true);
select tests.sees_household('public.valuations', :'b', false);
select tests.cannot_write('public.valuations', :'b',
  format($$ insert into public.valuations (household_id, property_id, as_of, value_vnd, method)
            values (%L, '00000000-0000-4000-8000-0000000000b1', '2026-10-07', 100000000, 'owner_estimate') $$, :'b'));
select throws_ok(format($$
  insert into public.valuations (household_id, property_id, as_of, value_vnd, method)
  values (%L, '00000000-0000-4000-8000-0000000000b1', '2026-10-07', 100000000, 'owner_estimate') $$, :'a'),
  '23503', null, 'a valuation pointing at another household''s property is refused (FND-2)');

select throws_ok(format($$
  insert into public.valuations (household_id, property_id, as_of, value_vnd, method)
  values (%L, '00000000-0000-4000-8000-0000000000a1', '2026-10-07', 0, 'owner_estimate') $$, :'a'),
  '23514', null, 'a value of 0 is refused');
-- The amount ceiling: MAX_AMOUNT_VND in packages/core/src/money/vnd.ts.
select throws_ok(format($$
  insert into public.valuations (household_id, property_id, as_of, value_vnd, method)
  values (%L, '00000000-0000-4000-8000-0000000000a1', '2026-10-07', 1000000000001, 'owner_estimate') $$, :'a'),
  '23514', null, 'a value one đồng above the ceiling is refused');
select throws_ok(format($$
  insert into public.valuations (household_id, property_id, as_of, value_vnd, method)
  values (%L, '00000000-0000-4000-8000-0000000000a1', '2026-10-07', 100000000, 'guess') $$, :'a'),
  '23514', null, 'a method outside the four is refused');
select throws_ok(format($$
  insert into public.valuations (household_id, property_id, as_of, value_vnd, method, source_url)
  values (%L, '00000000-0000-4000-8000-0000000000a1', '2026-10-07', 100000000, 'comparables', 'http://example.com') $$, :'a'),
  '23514', null, 'an http: source is refused');
select throws_ok(format($$
  insert into public.valuations (household_id, property_id, as_of, value_vnd, method, source_url)
  values (%L, '00000000-0000-4000-8000-0000000000a1', '2026-10-07', 100000000, 'comparables', 'javascript:alert(1)') $$, :'a'),
  '23514', null, 'a script source is refused');

select lives_ok($$ update public.valuations set value_vnd = 9000000000 where id = '00000000-0000-4000-8000-00000000f0a1' $$,
  'a member corrects the value');
select results_eq(
  $$ select action, actor_kind, actor_id from public.audit_log
     where table_name = 'valuations' and row_id = '00000000-0000-4000-8000-00000000f0a1' order by id $$,
  format($$ values ('insert', 'user', %L), ('update', 'user', %L) $$, :'member_a', :'member_a'),
  'the insert and the update each wrote one audit row with the member as actor (FND-2)');
select throws_ok(format($$ update public.valuations set household_id = %L where id = '00000000-0000-4000-8000-00000000f0a1' $$, :'b'),
  '23514', 'valuations rows cannot move to another household', 'a valuation never moves to another household');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.valuations', :'a', true);
select tests.cannot_write('public.valuations', :'a',
  format($$ insert into public.valuations (household_id, property_id, as_of, value_vnd, method)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '2026-10-07', 100000000, 'owner_estimate') $$, :'a'));

select tests.act_as('member.a@test.esta.test');
select isnt_empty($$ delete from public.valuations where id = '00000000-0000-4000-8000-00000000f0a1' returning 1 $$,
  'a member deletes a valuation: there is no soft delete');
select is((select count(*)::int from public.valuations where household_id = :'a'), 0, 'the deleted valuation is gone');

select finish();
rollback;
