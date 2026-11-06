begin;
\ir _harness.psql

select plan(42);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Căn hộ Thủ Đức', 'THUDUC', 'apartment', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind, list_rent_vnd, sort_order) values
  ('00000000-0000-4000-8000-000000000a11', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room', 3000000, 0),
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room', 3000000, 1),
  ('00000000-0000-4000-8000-000000000a13', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room', 3000000, 2);
insert into public.meters (id, household_id, property_id, unit_id, kind, pricing) values
  ('00000000-0000-4000-8000-00000000d12e', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}');
insert into public.utility_accounts (id, household_id, property_id, unit_id, kind, provider) values
  ('00000000-0000-4000-8000-0000000ac0a1', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12', 'electricity', 'Điện lực Demo'),
  ('00000000-0000-4000-8000-0000000ac0a2', :'a', '00000000-0000-4000-8000-0000000000a1', null, 'water', 'Cấp nước Demo');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Lê Văn Demo', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e003', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13',
   '00000000-0000-4000-8000-00000000a0a1', '2025-07-30', '2026-07-29', 3000000, 'ended');

select tests.act_as('member.a@test.esta.test');

-- Deleting and undoing a room is one update on the same row.
select results_eq(
  $$ delete from public.units where id = '00000000-0000-4000-8000-000000000a12' returning id $$,
  $$ select null::uuid where false $$,
  'a member''s DELETE of a room touches no row: deletion is an update that sets deleted_at');
select results_eq(
  $$ delete from public.utility_accounts where id = '00000000-0000-4000-8000-0000000ac0a1' returning id $$,
  $$ select null::uuid where false $$,
  'a member''s DELETE of an account touches no row');
select lives_ok(
  $$ update public.units set deleted_at = now() where id = '00000000-0000-4000-8000-000000000a12' $$,
  'a member puts Phòng 2 in the trash');
select is((select count(*)::int from public.units where property_id = '00000000-0000-4000-8000-0000000000a1' and deleted_at is null), 2,
  'two live rooms are left');
select is((select count(*)::int from public.meters where unit_id = '00000000-0000-4000-8000-000000000a12'), 1,
  'the room''s meter stays, so an undo does not lose it');
select is((select unit_id from public.utility_accounts where id = '00000000-0000-4000-8000-0000000ac0a1'), '00000000-0000-4000-8000-000000000a12'::uuid,
  'the room''s account stays linked, so an undo does not have to re-link it');
select is((select monthly_rent_vnd from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a1'), 6000000::bigint,
  'the property list sums the live rooms only');
select is((select unit_count from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a1'), 2,
  'the property list counts the live rooms only');
select lives_ok(
  $$ update public.units set deleted_at = null where id = '00000000-0000-4000-8000-000000000a12' $$,
  'Hoàn tác clears the stamp on the same row');
select results_eq(
  $$ select label, sort_order, list_rent_vnd from public.units where id = '00000000-0000-4000-8000-000000000a12' $$,
  $$ values ('Phòng 2', 1, 3000000::bigint) $$,
  'the restored room has its label, place in the list and rent');
select is((select count(*)::int from public.audit_log where table_name = 'units' and row_id = '00000000-0000-4000-8000-000000000a12' and action = 'update'), 2,
  'the delete and the undo are both in the change history');

-- A trashed room frees its label, and refuses to come back over a live one.
update public.units set deleted_at = now() where id = '00000000-0000-4000-8000-000000000a12';
select lives_ok(
  format($$ insert into public.units (id, household_id, property_id, label, kind) values ('00000000-0000-4000-8000-000000000a14', %L, '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room') $$, :'a'),
  'a new Phòng 2 can be added while the old one is in the trash');
select throws_ok(
  $$ update public.units set deleted_at = null where id = '00000000-0000-4000-8000-000000000a12' $$,
  '23505', null, 'the trashed Phòng 2 cannot come back beside a live one');
update public.units set label = 'Phòng 2b' where id = '00000000-0000-4000-8000-000000000a14';
select lives_ok(
  $$ update public.units set deleted_at = null where id = '00000000-0000-4000-8000-000000000a12' $$,
  'once the live room is renamed, the trashed one comes back');

-- The refusals the trigger keeps from the hard delete.
select throws_ok(
  $$ update public.units set deleted_at = now() where id = '00000000-0000-4000-8000-000000000a13' $$,
  '23503', 'ESTA_UNIT_HAS_LEASES', 'a room with lease history cannot go to the trash');
select throws_ok(
  $$ update public.units set deleted_at = now() where id = private.whole_unit_id('00000000-0000-4000-8000-0000000000a2') $$,
  '23514', null, 'the whole unit cannot go to the trash');

-- A lease cannot be written against a room in the trash.
update public.units set deleted_at = now() where id = '00000000-0000-4000-8000-000000000a11';
select throws_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id, start_date)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11', '00000000-0000-4000-8000-00000000a0a1', '2026-08-01') $$, :'a'),
  '23503', 'ESTA_UNIT_DELETED', 'a draft lease on a room in the trash is refused');
update public.units set deleted_at = null where id = '00000000-0000-4000-8000-000000000a11';

-- A property is never left with no unit, and a restored room takes the whole unit away again.
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a21', :'a', '00000000-0000-4000-8000-0000000000a2', 'Phòng A', 'room');
select is_empty($$ select 1 from public.units where property_id = '00000000-0000-4000-8000-0000000000a2' and kind = 'whole' $$,
  'a room replaces the whole unit');
update public.units set deleted_at = now() where id = '00000000-0000-4000-8000-000000000a21';
select results_eq(
  $$ select id from public.units where property_id = '00000000-0000-4000-8000-0000000000a2' and deleted_at is null $$,
  $$ values (private.whole_unit_id('00000000-0000-4000-8000-0000000000a2')) $$,
  'trashing the last room brings the whole unit back');
update public.units set deleted_at = null where id = '00000000-0000-4000-8000-000000000a21';
select results_eq(
  $$ select id from public.units where property_id = '00000000-0000-4000-8000-0000000000a2' and deleted_at is null $$,
  $$ values ('00000000-0000-4000-8000-000000000a21'::uuid) $$,
  'restoring the room takes the whole unit away again');

-- Accounts have the same undo.
select lives_ok($$ update public.utility_accounts set deleted_at = now() where id = '00000000-0000-4000-8000-0000000ac0a2' $$, 'a member puts an account in the trash');
select lives_ok($$ update public.utility_accounts set deleted_at = null where id = '00000000-0000-4000-8000-0000000ac0a2' $$, 'Hoàn tác restores it by id');
select is((select provider from public.utility_accounts where id = '00000000-0000-4000-8000-0000000ac0a2'), 'Cấp nước Demo', 'the restored account is the same row');

-- Adding rooms: numbered after the last live room in one call, a label already there is skipped, a trashed label is free.
select is(public.add_rooms('00000000-0000-4000-8000-0000000000a1', array['Phòng 3', 'Phòng 5', 'Phòng 6'], 2800000), 2,
  'add_rooms adds the two labels the property lacks');
select is((select min(sort_order) from public.units where property_id = '00000000-0000-4000-8000-0000000000a1' and label in ('Phòng 5', 'Phòng 6')), 3,
  'the new rooms are numbered after the highest live room');
select is(public.add_rooms('00000000-0000-4000-8000-0000000000a1', array['Phòng 5', 'Phòng 6'], null), 0, 'a second tap adds nothing');
update public.units set deleted_at = now() where property_id = '00000000-0000-4000-8000-0000000000a1' and label = 'Phòng 6';
select is(public.add_rooms('00000000-0000-4000-8000-0000000000a1', array['Phòng 6'], null), 1, 'a label in the trash can be added again');
select throws_ok($$ select public.add_rooms('00000000-0000-4000-8000-0000000000b1', array['Phòng 1'], null) $$, 'P0002', 'ESTA_PROPERTY_NOT_FOUND',
  'a member cannot add rooms to another household''s property');

-- Reordering: every room or none.
select is(public.reorder_units('00000000-0000-4000-8000-0000000000a1', '[{"id": "00000000-0000-4000-8000-000000000a11", "sort_order": 9}, {"id": "00000000-0000-4000-8000-000000000a12", "sort_order": 8}]'), 2,
  'reorder_units renumbers both rooms');
select throws_ok(
  $$ select public.reorder_units('00000000-0000-4000-8000-0000000000a1', '[{"id": "00000000-0000-4000-8000-000000000a11", "sort_order": 1}, {"id": "00000000-0000-4000-8000-000000000a21", "sort_order": 2}]') $$,
  'P0002', 'ESTA_UNITS_CHANGED', 'a room of another property refuses the whole reorder');
select is((select sort_order from public.units where id = '00000000-0000-4000-8000-000000000a11'), 9, 'the refused reorder moved no room');
update public.units set deleted_at = now() where id = '00000000-0000-4000-8000-000000000a14';
select throws_ok(
  $$ select public.reorder_units('00000000-0000-4000-8000-0000000000a1', '[{"id": "00000000-0000-4000-8000-000000000a14", "sort_order": 1}]') $$,
  'P0002', 'ESTA_UNITS_CHANGED', 'a room in the trash cannot be reordered');

-- Other households and viewers.
select tests.cannot_write('public.units', :'b', format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000b1', 'Phòng 1', 'room') $$, :'b'));
select is_empty($$ update public.units set deleted_at = now() where household_id = (select household_id from public.properties where id = '00000000-0000-4000-8000-0000000000b1') returning 1 $$,
  'a member cannot put another household''s room in the trash');
select tests.act_as('viewer.a@test.esta.test');
select throws_ok($$ select public.reorder_units('00000000-0000-4000-8000-0000000000a1', '[]') $$, 'P0002', 'ESTA_PROPERTY_NOT_FOUND', 'a viewer cannot reorder rooms');

-- The check behind the undo model: a table with a deleted_at column has no delete policy, so a user's DELETE cannot skip the trash.
select tests.clear_request();
reset role;
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
     join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'deleted_at' and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and exists (select 1 from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = c.relname || '_delete') $$,
  'every public table with deleted_at calls enable_soft_delete');

select * from finish();
rollback;
