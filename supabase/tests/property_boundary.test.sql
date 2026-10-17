begin;
\ir _harness.psql

select plan(26);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (household_id, nickname, code, kind, use_mode, location)
values
  (:'a', 'Nhà phố Q7', 'Q7', 'townhouse', 'rental', 'SRID=4326;POINT(106.7058 10.7295)'),
  (:'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held', 'SRID=4326;POINT(107.808 11.547)'),
  (:'a', 'Đất vườn Long An', 'LONGAN', 'agricultural_land', 'held', null),
  (:'b', 'Kho nhà B', 'KHO', 'warehouse', 'rental', 'SRID=4326;POINT(106.846 10.97)');
select id as q7 from public.properties where household_id = :'a' and code = 'Q7' \gset
select id as baoloc from public.properties where household_id = :'a' and code = 'BAOLOC' \gset
select id as longan from public.properties where household_id = :'a' and code = 'LONGAN' \gset
select id as kho from public.properties where household_id = :'b' and code = 'KHO' \gset
select set_config('tests.q7', :'q7', true), set_config('tests.baoloc', :'baoloc', true),
  set_config('tests.longan', :'longan', true), set_config('tests.kho', :'kho', true);

select tests.act_as('member.a@test.esta.test');

select results_eq(
  $$ select lat, lng, has_boundary from public.property_list_rows where id = current_setting('tests.q7')::uuid $$,
  $$ values (10.7295::double precision, 106.7058::double precision, false) $$,
  'property_list_rows reads lat and lng from location for q7');
select results_eq(
  $$ select lat is null and lng is null from public.property_list_rows where id = current_setting('tests.longan')::uuid $$,
  array[true], 'an unpinned property has no lat or lng');

select is(
  public.set_property_location(current_setting('tests.longan')::uuid, 10.533, 106.405), null,
  'pinning an unpinned property returns no previous point');
select results_eq(
  $$ select lat, lng from public.property_list_rows where id = current_setting('tests.longan')::uuid $$,
  $$ values (10.533::double precision, 106.405::double precision) $$,
  'the new pin reads back');
select is(
  public.set_property_location(current_setting('tests.longan')::uuid, null, null), '{"lat": 10.533, "lng": 106.405}'::jsonb,
  'clearing the pin returns the point it replaced, for undo');
select throws_ok(
  $$ select public.set_property_location(current_setting('tests.longan')::uuid, 10.5, null) $$,
  '22023', null, 'a latitude without a longitude is refused');
select throws_ok(
  $$ select public.set_property_location(current_setting('tests.longan')::uuid, 10.5, 407) $$,
  '22003', null, 'a longitude past 180 is refused, not wrapped to 47');
select throws_ok(
  $$ select public.set_property_location(current_setting('tests.longan')::uuid, -90.5, 106) $$,
  '22003', null, 'a latitude past -90 is refused');
select throws_ok(
  $$ select public.set_property_boundary(current_setting('tests.baoloc')::uuid,
    '{"type": "Polygon", "coordinates": [[[107.8, 11.5], [207.81, 11.5], [207.81, 91.51], [107.8, 11.5]]]}') $$,
  '23514', null, 'a boundary corner outside the lng and lat ranges is refused by the check');
select lives_ok(
  $$ select public.set_property_location(current_setting('tests.longan')::uuid, -90, 180),
            public.set_property_location(current_setting('tests.longan')::uuid, null, null) $$,
  'the range edges -90 and 180 are accepted');

select throws_ok(
  $$ select public.set_property_boundary(current_setting('tests.baoloc')::uuid,
    '{"type": "Polygon", "coordinates": [[[107.8, 11.5], [107.81, 11.51], [107.81, 11.5], [107.8, 11.51], [107.8, 11.5]]]}') $$,
  '23514', null, 'a self-crossing ring is refused by the check');
select throws_ok(
  $$ select public.set_property_boundary(current_setting('tests.baoloc')::uuid,
    '{"type": "Polygon", "coordinates": [[[107.8, 11.5], [107.81, 11.5], [107.82, 11.5], [107.8, 11.5]]]}') $$,
  '23514', null, 'a ring with no area is refused by the check');
select throws_ok(
  $$ update public.properties set boundary = 'SRID=4326;POLYGON((107.8 11.5, 107.81 11.51, 107.81 11.5, 107.8 11.51, 107.8 11.5))'
     where id = current_setting('tests.baoloc')::uuid $$,
  '23514', null, 'a direct update with a self-crossing ring is refused too');
select is(public.property_boundary(current_setting('tests.baoloc')::uuid), null, 'nothing was saved by the refused writes');

select is(
  public.set_property_boundary(current_setting('tests.baoloc')::uuid,
    '{"type": "Polygon", "coordinates": [[[107.8, 11.5], [107.81, 11.5], [107.81, 11.51], [107.8, 11.51], [107.8, 11.5]]]}'),
  null, 'the first boundary returns no previous polygon');
select results_eq(
  $$ select has_boundary from public.property_list_rows where id = current_setting('tests.baoloc')::uuid $$,
  array[true], 'has_boundary turns on');
select is(
  public.property_boundary(current_setting('tests.baoloc')::uuid) -> 'coordinates' -> 0 -> 2,
  '[107.81, 11.51]'::jsonb, 'property_boundary returns GeoJSON with lng before lat');
select is(
  public.set_property_boundary(current_setting('tests.baoloc')::uuid, null) ->> 'type', 'Polygon',
  'clearing the boundary returns the polygon it replaced, for undo');

select throws_ok(
  $$ select public.set_property_location(current_setting('tests.kho')::uuid, 10, 106) $$,
  'P0002', null, 'a member cannot pin a property of another household');
select throws_ok(
  $$ select public.set_property_boundary(current_setting('tests.kho')::uuid,
    '{"type": "Polygon", "coordinates": [[[106.8, 10.9], [106.81, 10.9], [106.81, 10.91], [106.8, 10.9]]]}') $$,
  'P0002', null, 'a member cannot draw a boundary on a property of another household');
select is(public.property_boundary(current_setting('tests.kho')::uuid), null, 'another household''s boundary is not readable');

select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  $$ select public.set_property_location(current_setting('tests.q7')::uuid, 10, 106) $$,
  'P0002', null, 'a viewer cannot move a pin');
select throws_ok(
  $$ select public.set_property_boundary(current_setting('tests.q7')::uuid, null) $$,
  'P0002', null, 'a viewer cannot clear a boundary');
select is_empty(
  $$ update public.properties set location = null, boundary = null where id = current_setting('tests.q7')::uuid returning 1 $$,
  'a viewer''s direct update of location and boundary touches no row');

reset role;
select tests.clear_request();
select results_eq(
  $$ select lat, lng from public.property_list_rows where id = current_setting('tests.q7')::uuid $$,
  $$ values (10.7295::double precision, 106.7058::double precision) $$,
  'q7 kept its pin through the viewer''s attempts');
select ok(
  not has_function_privilege('anon', 'public.set_property_location(uuid, double precision, double precision)', 'execute')
    and not has_function_privilege('anon', 'public.set_property_boundary(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.property_boundary(uuid)', 'execute'),
  'anon cannot call the location functions');

select * from finish();
rollback;
