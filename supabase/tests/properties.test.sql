begin;
\ir _harness.psql

select plan(26);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset

create temporary view property_audit as
  select * from public.audit_log where table_name = 'properties' order by id desc;
grant select on property_audit to authenticated;

select set_config('esta.actor', 'system:test', true);
insert into public.properties (household_id, nickname, code, kind, use_mode)
values (:'b', 'Nhà B', 'Q7', 'townhouse', 'rental');

select tests.act_as('member.a@test.esta.test');

select lives_ok(
  format($$ insert into public.properties (household_id, nickname, code, kind, use_mode, current_address, location)
            values (%L, 'Nhà phố Q7', 'Q7', 'townhouse', 'rental',
                    '{"street": "Đường số 15", "commune_code": "27475", "province_code": "79"}',
                    'SRID=4326;POINT(106.7058 10.7295)') $$, :'a'),
  'a member inserts a property into its household');
select is((select created_by from public.properties where household_id = :'a'), :'member_a'::uuid,
  'created_by is the inserting user');
select throws_ok(
  format($$ insert into public.properties (household_id, nickname, code, kind, use_mode)
            values (%L, 'Nhà phố Q7 khác', 'Q7', 'townhouse', 'rental') $$, :'a'),
  '23505', null, 'a second Q7 in the same household is a unique violation');
select throws_ok(
  format($$ insert into public.properties (household_id, nickname, code, kind, use_mode)
            values (%L, 'Nhà thường', 'q-7', 'townhouse', 'rental') $$, :'a'),
  '23514', null, 'a code outside A-Z and 0-9 is refused');
select throws_ok(
  format($$ insert into public.properties (household_id, nickname, code, kind, use_mode, current_address)
            values (%L, 'Sai mã', 'X1', 'townhouse', 'rental', '{"commune_code": "Q7"}') $$, :'a'),
  '23514', null, 'a commune code that is not five digits is refused');

select lives_ok(
  format($$ update public.properties set nickname = 'Nhà phố Q7 Demo' where household_id = %L $$, :'a'),
  'a member renames its own property');
select throws_ok(
  format($$ update public.properties set household_id = %L where household_id = %L $$, :'b', :'a'),
  '23514', null, 'a property cannot move to another household');

select tests.sees_household('public.properties', :'a', true);
select tests.sees_household('public.properties', :'b', false);
select tests.cannot_write('public.properties', :'b',
  format($$ insert into public.properties (household_id, nickname, code, kind, use_mode)
            values (%L, 'Xâm nhập', 'X9', 'townhouse', 'rental') $$, :'b'));

select results_eq(
  'select action, actor_kind, actor_id from property_audit where household_id = ' || quote_literal(:'a') || ' order by id',
  format($$ values ('insert', 'user', %L), ('update', 'user', %L) $$, :'member_a', :'member_a'),
  'the insert and the rename each write one audit row naming the user');
select is((select diff -> 'nickname' from property_audit where household_id = :'a' limit 1),
  '{"old": "Nhà phố Q7", "new": "Nhà phố Q7 Demo"}'::jsonb, 'the rename diff holds both nicknames');

select is_empty(
  format($$ delete from public.properties where household_id = %L returning 1 $$, :'a'),
  'a member DELETE touches no property, since properties are soft-deleted');
select lives_ok(
  format($$ update public.properties set deleted_at = '2026-10-07T02:00:00Z' where household_id = %L $$, :'a'),
  'a member soft-deletes its own property by setting deleted_at');
select is((select deleted_at from public.properties where household_id = :'a'), '2026-10-07T02:00:00Z'::timestamptz,
  'the soft-deleted property keeps its row');
select ok(exists(select 1 from property_audit where household_id = :'a' and action = 'update' and diff ? 'deleted_at'),
  'the soft delete writes an update audit row');

reset role;
insert into public.properties (household_id, nickname, code, kind, use_mode)
values (:'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.properties', :'a', true);
select is_empty(
  format($$ update public.properties set deleted_at = '2026-10-07T02:00:00Z' where household_id = %L returning 1 $$, :'a'),
  'a viewer cannot soft-delete a property');
select tests.cannot_write('public.properties', :'a',
  format($$ insert into public.properties (household_id, nickname, code, kind, use_mode)
            values (%L, 'Của viewer', 'V1', 'townhouse', 'rental') $$, :'a'));

select tests.act_as('admin.b@test.esta.test');
select tests.sees_household('public.properties', :'a', false);
select lives_ok(
  format($$ insert into public.properties (household_id, nickname, code, kind, use_mode)
            values (%L, 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held') $$, :'b'),
  'another household may reuse a code');

reset role;
select throws_ok($$ select private.enable_soft_delete('public.household_settings') $$, 'P0001',
  'public.household_settings has no deleted_at column', 'soft delete needs a deleted_at column');

select * from finish();
rollback;
