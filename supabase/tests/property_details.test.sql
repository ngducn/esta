begin;
\ir _harness.psql

select plan(24);

select tests.create_household('a') as a \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (household_id, nickname, code, kind, use_mode, kind_details)
values (:'a', 'Căn hộ A', 'CH1', 'apartment', 'rental',
  '{"building_name": "Demo Tower", "block": "A", "floor": 12, "unit_no": "A-12.05", "management_fee_vnd": 1200000}');
select id as pa from public.properties where household_id = :'a' and code = 'CH1' \gset

select ok(private.valid_kind_details('apartment', '{"building_name": "Demo", "floor": -1, "management_fee_vnd": 0}'),
  'an apartment takes a subset of its keys, a basement floor and a zero fee');
select ok(private.valid_kind_details('rooming_house', '{"room_count": 8}'), 'a rooming house takes room_count');
select ok(private.valid_kind_details('agricultural_land', '{"frontage_m": 25, "road_width_m": 4.5}'),
  'land takes frontage and road width in metres');
select ok(private.valid_kind_details('townhouse', '{}'), 'a townhouse takes no keys');
select ok(not private.valid_kind_details('townhouse', '{"room_count": 3}'), 'PRP-1: a townhouse refuses a rooming house key');
select ok(not private.valid_kind_details('apartment', '{"frontage_m": 5}'), 'PRP-1: an apartment refuses a land key');
select ok(not private.valid_kind_details('residential_land', '{"unit_no": "A1"}'), 'PRP-1: land refuses an apartment key');
select ok(not private.valid_kind_details('rooming_house', '{"room_count": 2.5}'), 'room_count is a whole number');
select ok(not private.valid_kind_details('apartment', '{"management_fee_vnd": "1tr2"}'), 'the fee is a number, not text');
select ok(not private.valid_kind_details('apartment', '{"management_fee_vnd": -1}'), 'the fee is not negative');
select ok(not private.valid_kind_details('apartment', '{"block": " "}'), 'a blank text detail is refused');
select ok(not private.valid_kind_details('residential_land', '{"frontage_m": 0}'), 'a frontage of zero is refused');

select throws_ok(format($$ update public.properties set kind = 'townhouse' where id = %L $$, :'pa'),
  '23514', null, 'changing the kind keeps the old details, so the check refuses it until they are replaced');
select lives_ok(format($$ update public.properties set kind = 'townhouse', kind_details = '{}' where id = %L $$, :'pa'),
  'changing the kind with its own details passes');
select throws_ok(format($$ update public.properties set acquisition_kind = 'lottery' where id = %L $$, :'pa'),
  '23514', null, 'an unknown acquisition_kind is refused');
select throws_ok(format($$ update public.properties set acquisition_price_vnd = -1 where id = %L $$, :'pa'),
  '23514', null, 'a negative acquisition price is refused');
select lives_ok(format($$
  update public.properties
  set acquired_on = '2019-05-20', acquisition_kind = 'purchase', acquisition_price_vnd = 3200000000, notes = 'Demo'
  where id = %L $$, :'pa'),
  'a member-shaped acquisition saves');

select tests.act_as('viewer.a@test.esta.test');
select is_empty(format($$ update public.properties set acquisition_price_vnd = 1 where id = %L returning 1 $$, :'pa'),
  'FND-2: a viewer cannot update the acquisition columns');
select is_empty(format($$ update public.properties set cover_photo_path = '%s/%s/cover.webp' where id = %L returning 1 $$, :'a', :'pa', :'pa'),
  'FND-2: a viewer cannot update cover_photo_path');

select tests.act_as('member.a@test.esta.test');
select isnt_empty(format($$ update public.properties set acquisition_price_vnd = 3300000000, notes = null where id = %L returning 1 $$, :'pa'),
  'a member updates the acquisition columns and notes');
select throws_ok(
  format($$ insert into public.properties (household_id, nickname, code, kind, use_mode, location)
    values (%L, 'Nhà ghim', 'G1', 'townhouse', 'rental', 'SRID=4326;POINT(106.7 10.7)') $$, :'a'),
  '42501', null, '#84: a member cannot insert a location directly, so every pin goes through set_property_location');

reset role;
select tests.clear_request();
select is(
  (select array_agg(column_name::text order by column_name)
   from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'properties'
     and not has_column_privilege('authenticated', 'public.properties', c.column_name, 'INSERT')),
  array['boundary', 'location'],
  'authenticated may insert every properties column except location and boundary, including any a later migration adds');
select is(
  (select array_agg(column_name::text order by column_name)
   from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'properties'
     and not has_column_privilege('authenticated', 'public.properties', c.column_name, 'UPDATE')),
  array['boundary', 'location'],
  'authenticated may update every properties column except location and boundary, including any a later migration adds');
select ok(not has_function_privilege('anon', 'private.valid_kind_details(text, jsonb)', 'execute'),
  'anon cannot call valid_kind_details');

select * from finish();
rollback;
