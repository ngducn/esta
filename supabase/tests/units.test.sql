begin;
\ir _harness.psql

select plan(58);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Mặt bằng Quận 1', 'Q1', 'commercial_space', 'rental'),
  ('00000000-0000-4000-8000-0000000000a3', :'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');

select results_eq(
  $$ select id, label, kind from public.units where property_id = '00000000-0000-4000-8000-0000000000a1' $$,
  $$ values (extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'esta:unit:whole:00000000-0000-4000-8000-0000000000a1'), 'Toàn bộ', 'whole') $$,
  'a new property gets one whole unit Toàn bộ with the id derived from the property');
select is(private.whole_unit_id('00000000-0000-4000-8000-0000000000a1'),
  extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'esta:unit:whole:00000000-0000-4000-8000-0000000000a1'),
  'whole_unit_id is uuid v5 of esta:unit:whole:<property id>');

select tests.act_as('member.a@test.esta.test');

select lives_ok(
  format($$ insert into public.units (household_id, property_id, label, kind, list_rent_vnd, available_from, sort_order)
            select %L, '00000000-0000-4000-8000-0000000000a1', 'Phòng ' || n, 'room',
                   case when n <= 4 then 2500000 when n <= 7 then 2800000 else 3000000 end,
                   case when n = 8 then date '2026-08-01' end, n
            from generate_series(1, 8) as n $$, :'a'),
  'a member adds Phòng 1 to Phòng 8 in one statement');
select is_empty($$ select 1 from public.units where property_id = '00000000-0000-4000-8000-0000000000a1' and kind = 'whole' $$,
  'the rooms replace the whole unit');
select is((select count(*)::int from public.units where property_id = '00000000-0000-4000-8000-0000000000a1'), 8,
  'Dĩ An has exactly its 8 rooms');
select is((select monthly_rent_vnd from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a1'), 21400000::bigint,
  'property_list_rows.monthly_rent_vnd sums the rooms to 21400000');
select is((select vacant_since from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a1'), date '2026-08-01',
  'vacant_since is the earliest available_from, Phòng 8 on 2026-08-01');

select lives_ok(
  format($$ insert into public.units (household_id, property_id, label, kind, list_rent_vnd)
            values (%L, '00000000-0000-4000-8000-0000000000a2', 'Mặt bằng tầng trệt', 'shop', 30000000) $$, :'a'),
  'a member adds a shop to Quận 1');
select results_eq(
  $$ select monthly_rent_vnd, vacant_since from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a2' $$,
  $$ values (30000000::bigint, null::date) $$,
  'Quận 1 lists 30000000 and no vacant_since, because its shop has no available date');
select results_eq(
  $$ select monthly_rent_vnd, vacant_since from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a3' $$,
  $$ values (null::bigint, null::date) $$,
  'a property whose only unit has no rent lists a null rent');

update public.units set available_from = null where property_id = '00000000-0000-4000-8000-0000000000a1' and label = 'Phòng 8';
select is((select vacant_since from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a1'), null::date,
  'vacant_since turns null once Phòng 8 loses its available_from');

select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room') $$, :'a'),
  '23505', null, 'a duplicate label on the same property is refused');
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000a3', 'Toàn bộ 2', 'whole') $$, :'a'),
  '23505', null, 'a second whole unit is refused');
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000a2', 'Toàn bộ', 'whole') $$, :'a'),
  '23514', null, 'a whole unit beside another unit is refused');
select throws_ok(
  $$ update public.units set kind = 'whole' where property_id = '00000000-0000-4000-8000-0000000000a1' and label = 'Phòng 1' $$,
  '23514', null, 'turning a room into the whole unit while other rooms exist is refused');
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind, list_rent_vnd) values (%L, '00000000-0000-4000-8000-0000000000a1', 'Phòng 20', 'room', -1) $$, :'a'),
  '23514', null, 'a negative list rent is refused');
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind, area_m2) values (%L, '00000000-0000-4000-8000-0000000000a1', 'Phòng 20', 'room', 0) $$, :'a'),
  '23514', null, 'an area of zero is refused');
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000a1', '  ', 'room') $$, :'a'),
  '23514', null, 'a blank label is refused');
select throws_ok(
  $$ update public.units set property_id = '00000000-0000-4000-8000-0000000000a2'
     where property_id = '00000000-0000-4000-8000-0000000000a1' and label = 'Phòng 4' $$,
  '23514', null, 'a unit cannot move to another property');
select throws_ok(
  $$ update public.units set kind = 'room' where id = private.whole_unit_id('00000000-0000-4000-8000-0000000000a3') $$,
  '23514', null, 'the whole unit cannot change its kind');
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind, list_rent_vnd)
            values (%L, '00000000-0000-4000-8000-0000000000a1', 'Phòng 21', 'room', 1000000000001) $$, :'a'),
  '23514', null, 'a list rent above 1.000.000.000.000 is refused');
select lives_ok(
  $$ update public.units set list_rent_vnd = 1000000000000
     where property_id = '00000000-0000-4000-8000-0000000000a1' and label = 'Phòng 4' $$,
  'a list rent of exactly 1.000.000.000.000 is accepted');
update public.units set list_rent_vnd = 2500000 where property_id = '00000000-0000-4000-8000-0000000000a1' and label = 'Phòng 4';
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000b1', 'Phòng 1', 'room') $$, :'a'),
  '23503', null, 'a unit on another household''s property under the member''s own household is refused');

select id as room2 from public.units where property_id = '00000000-0000-4000-8000-0000000000a1' and label = 'Phòng 2' \gset
select throws_ok(
  format($$ insert into public.utility_accounts (household_id, property_id, unit_id, kind) values (%L, '00000000-0000-4000-8000-0000000000a2', %L, 'electricity') $$, :'a', :'room2'),
  '23503', null, 'an account on another property''s unit is refused');
select lives_ok(
  format($$ insert into public.utility_accounts (id, household_id, property_id, unit_id, kind, provider, customer_code)
            values ('00000000-0000-4000-8000-0000000ac0a1', %L, '00000000-0000-4000-8000-0000000000a1', %L, 'electricity', 'Điện lực Demo', 'PE0123456789') $$, :'a', :'room2'),
  'a member records an electricity account on Phòng 2');
select lives_ok(
  format($$ insert into public.utility_accounts (household_id, property_id, kind, provider) values (%L, '00000000-0000-4000-8000-0000000000a1', 'water', 'Cấp nước Demo') $$, :'a'),
  'a member records a water account at property level');
select throws_ok(
  format($$ insert into public.utility_accounts (household_id, property_id, kind) values (%L, '00000000-0000-4000-8000-0000000000a1', 'gas') $$, :'a'),
  '23514', null, 'an account kind outside the list is refused');

delete from public.units where id = :'room2';
select is((select unit_id from public.utility_accounts where id = '00000000-0000-4000-8000-0000000ac0a1'), null::uuid,
  'deleting Phòng 2 moves its account to property level');

delete from public.units where property_id = '00000000-0000-4000-8000-0000000000a2';
select results_eq(
  $$ select id, label, kind from public.units where property_id = '00000000-0000-4000-8000-0000000000a2' $$,
  $$ values (private.whole_unit_id('00000000-0000-4000-8000-0000000000a2'), 'Toàn bộ', 'whole') $$,
  'deleting the last unit brings back the whole unit with its derived id');
delete from public.units where property_id = '00000000-0000-4000-8000-0000000000a1';
select results_eq(
  $$ select id, kind from public.units where property_id = '00000000-0000-4000-8000-0000000000a1' $$,
  $$ values (private.whole_unit_id('00000000-0000-4000-8000-0000000000a1'), 'whole') $$,
  'deleting every room in one statement leaves exactly one whole unit');
delete from public.units where id = private.whole_unit_id('00000000-0000-4000-8000-0000000000a3');
select is((select count(*)::int from public.units where property_id = '00000000-0000-4000-8000-0000000000a3'), 1,
  'deleting the whole unit itself leaves the property with one whole unit');
update public.properties set deleted_at = now() where id = '00000000-0000-4000-8000-0000000000a3';
insert into public.units (household_id, property_id, label, kind) values (:'a', '00000000-0000-4000-8000-0000000000a3', 'Lô đất', 'lot');
delete from public.units where property_id = '00000000-0000-4000-8000-0000000000a3';
select is((select kind from public.units where property_id = '00000000-0000-4000-8000-0000000000a3'), 'whole',
  'an archived property still gets its whole unit back');

select tests.sees_household('public.units', :'a', true);
select tests.sees_household('public.units', :'b', false);
select tests.cannot_write('public.units', :'b',
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000b1', 'Phòng 1', 'room') $$, :'b'));
select tests.sees_household('public.utility_accounts', :'a', true);
select tests.cannot_write('public.utility_accounts', :'b',
  format($$ insert into public.utility_accounts (household_id, property_id, kind) values (%L, '00000000-0000-4000-8000-0000000000b1', 'water') $$, :'b'));
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000ff', 'Phòng 1', 'room') $$, :'b'),
  '42501', null, 'a unit on a property id that does not exist in another household is refused the same way as one that does');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.units', :'a', true);
select tests.sees_household('public.utility_accounts', :'a', true);
select tests.cannot_write('public.units', :'a',
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room') $$, :'a'));
select tests.cannot_write('public.utility_accounts', :'a',
  format($$ insert into public.utility_accounts (household_id, property_id, kind) values (%L, '00000000-0000-4000-8000-0000000000a1', 'water') $$, :'a'));

select tests.clear_request();
reset role;
alter table public.properties disable trigger ensure_whole_unit;
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a4', :'a', 'Nhà cũ', 'OLD', 'townhouse', 'held');
alter table public.properties enable trigger ensure_whole_unit;
select is(private.backfill_whole_units(), 1, 'the backfill adds the whole unit a property without units lacks');
select is(private.backfill_whole_units(), 0, 'a second backfill adds nothing');
select is((select count(*)::int from public.units where household_id = :'a' and kind = 'whole'), 4,
  'every property of household a has exactly one whole unit after both runs');

select ok(not has_function_privilege('authenticated', 'private.backfill_whole_units()', 'execute'),
  'authenticated cannot run the backfill');
select ok(not has_table_privilege('anon', 'public.units', 'select') and not has_table_privilege('anon', 'public.utility_accounts', 'select'),
  'anon cannot read units or utility accounts');

select tests.act_as_service('{"x-esta-actor": "system:test"}');
select lives_ok(format($$ delete from public.households where id = %L $$, :'a'), 'a service-role household delete cascades through units and accounts');
select tests.clear_request();
reset role;
select is((select count(*)::int from public.units where household_id = :'a'), 0, 'no unit of the deleted household is left or recreated');
select is((select count(*)::int from public.utility_accounts where household_id = :'a'), 0, 'no account of the deleted household is left');

select * from finish();
rollback;
