begin;
\ir _harness.psql

select plan(14);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select id as owner_a from public.parties where household_id = :'a' and full_name = 'Owner a' \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode, current_address, location, acquired_on, acquisition_kind) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Kho Demo hai thửa', 'KHO', 'warehouse', 'rental',
   '{"street": "Đường số 7", "commune_code": "26188", "province_code": "75", "line": "Đường số 7"}',
   'SRID=4326;POINT(106.846 10.97)', '2017-07-01', 'purchase'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Đất Demo trống', 'TRONG', 'agricultural_land', 'held',
   '{"commune_code": "27694", "province_code": "80"}', null, '2020-01-01', null),
  ('00000000-0000-4000-8000-0000000000a3', :'a', 'Nhà Demo đã bán', 'SOLD', 'townhouse', 'held', null, null, null, null),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà Demo B', 'B1', 'townhouse', 'rental', null, null, null, null);
update public.properties set deleted_at = '2026-10-01T00:00:00Z' where id = '00000000-0000-4000-8000-0000000000a3';
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000fa02', :'a', 'individual', 'Trần Minh Demo', array['owner']);
insert into public.parcels (id, household_id, property_id, parcel_no, map_sheet_no, area_m2, created_at) values
  ('00000000-0000-4000-8000-0000000001a1', :'a', '00000000-0000-4000-8000-0000000000a1', '95', '22', 1200, '2026-10-01T00:00:00Z'),
  ('00000000-0000-4000-8000-0000000001a2', :'a', '00000000-0000-4000-8000-0000000000a1', '96', null, null, '2026-10-02T00:00:00Z'),
  ('00000000-0000-4000-8000-0000000001a3', :'a', '00000000-0000-4000-8000-0000000000a1', null, null, null, '2026-10-03T00:00:00Z');
insert into public.structures (household_id, property_id, kind, floor_area_m2) values
  (:'a', '00000000-0000-4000-8000-0000000000a1', 'Nhà kho', 900),
  (:'a', '00000000-0000-4000-8000-0000000000a1', 'Nhà bảo vệ', null);
insert into public.ownership_shares (household_id, property_id, party_id, share_bp) values
  (:'a', '00000000-0000-4000-8000-0000000000a1', :'owner_a', 6000),
  (:'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000fa02', 3000);
insert into public.utility_accounts (household_id, property_id, kind) values
  (:'a', '00000000-0000-4000-8000-0000000000a1', 'electricity'),
  (:'a', '00000000-0000-4000-8000-0000000000a1', 'water');

select ok(
  (select 'security_invoker=true' = any(c.reloptions) from pg_class c where c.oid = 'public.property_completeness_facts'::regclass),
  'the view reads under the caller''s RLS');
select ok(not has_table_privilege('anon', 'public.property_completeness_facts', 'select'), 'anon cannot read the view');
select ok(
  not has_table_privilege('authenticated', 'public.property_completeness_facts', 'insert')
    and not has_table_privilege('authenticated', 'public.property_completeness_facts', 'update')
    and not has_table_privilege('authenticated', 'public.property_completeness_facts', 'delete'),
  'authenticated can only select');

select tests.act_as('member.a@test.esta.test');

select tests.sees_household('public.property_completeness_facts', :'a', true);
select tests.sees_household('public.property_completeness_facts', :'b', false);
select is_empty($$ select 1 from public.property_completeness_facts where property_id = '00000000-0000-4000-8000-0000000000a3' $$,
  'an archived property has no row');

select row_eq(
  $$ select kind, has_current_address, has_location, has_acquisition, parcel_count, parcel_without_number_id,
            parcel_without_area_id, structure_count, structure_without_floor_area_id, share_total_bp, utility_account_count
     from public.property_completeness_facts where property_id = '00000000-0000-4000-8000-0000000000a1' $$,
  row('warehouse'::text, true, true, true, 3, '00000000-0000-4000-8000-0000000001a2'::uuid,
      '00000000-0000-4000-8000-0000000001a2'::uuid, 2, (select id from public.structures where kind = 'Nhà bảo vệ'), 9000, 2),
  'two incomplete parcels name the earlier one, and a 6000 + 3000 bp share set totals 9000');
select row_eq(
  $$ select has_current_address, has_location, has_acquisition, parcel_count, parcel_without_number_id, parcel_without_area_id,
            structure_count, share_total_bp, utility_account_count
     from public.property_completeness_facts where property_id = '00000000-0000-4000-8000-0000000000a2' $$,
  row(false, false, false, 0, null::uuid, null::uuid, 0, 0, 0),
  'a commune without a street, a date without a kind and no children read as missing');

update public.ownership_shares set share_bp = 7000 where party_id = :'owner_a' and property_id = '00000000-0000-4000-8000-0000000000a1';
select is((select share_total_bp from public.property_completeness_facts where property_id = '00000000-0000-4000-8000-0000000000a1'), 10000,
  'raising a share to 100% shows at once');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.property_completeness_facts', :'a', true);
select is((select count(*)::int from public.property_completeness_facts), 2, 'a viewer reads the two live properties of the household');

select tests.act_as('member.b@test.esta.test');
select tests.sees_household('public.property_completeness_facts', :'a', false);
select is_empty($$ select 1 from public.property_completeness_facts where property_id = '00000000-0000-4000-8000-0000000000a1' $$,
  'a member of another household reads nothing by property id');
select is((select count(*)::int from public.property_completeness_facts), 1, 'household b reads only its own property');

select * from finish();
rollback;
