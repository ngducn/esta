begin;
\ir _harness.psql

select plan(10);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset

update public.household_members set display_name = 'Nguyễn Thị Demo' where user_id = :'member_a';

select set_config('esta.actor', 'system:seed', true);
insert into public.properties (household_id, nickname, code, kind, use_mode)
values (:'a', 'Đất vườn Demo', 'LONGAN', 'agricultural_land', 'held') returning id as property_a \gset
insert into public.properties (household_id, nickname, code, kind, use_mode)
values (:'b', 'Nhà B Demo', 'Q7', 'townhouse', 'rental') returning id as property_b \gset

delete from public.test_clock;
insert into public.test_clock (frozen_now) values ('2026-10-07T09:00:00+07:00');

select tests.act_as('member.a@test.esta.test');
select public.set_property_location(:'property_a', 10.5331, 106.4052);
update public.properties set nickname = 'Đất vườn Long An Demo' where id = :'property_a';
reset role;

select is((select at from public.audit_log order by id desc limit 1), '2026-10-07T09:00:00+07:00'::timestamptz,
  'an audit row written while the test clock is set takes its time');

select tests.act_as('member.a@test.esta.test');
select results_eq(
  format($$ select action, actor_kind, coalesce(actor_name, '-'), diff ? 'nickname', diff ? 'location'
            from public.property_activity(%L) $$, :'property_a'),
  $$ values ('update', 'user', 'Nguyễn Thị Demo', true, false),
            ('update', 'user', 'Nguyễn Thị Demo', false, true),
            ('insert', 'system', '-', true, false) $$,
  'a member reads the property history newest first, with its own name on its own changes');
select is((select actor_id from public.property_activity(:'property_a') order by id limit 1), 'seed',
  'the seed insert names the seed as its actor');
select is((select count(*)::int from public.property_activity(:'property_a', 1)), 1, 'the limit caps the rows');
select is_empty(format('select 1 from public.property_activity(%L)', :'property_b'),
  'another household''s property returns no row');

select tests.act_as('viewer.a@test.esta.test');
select is((select count(*)::int from public.property_activity(:'property_a')), 3, 'a viewer reads the history (FND-2)');
select is((select actor_name from public.property_activity(:'property_a') limit 1), 'Nguyễn Thị Demo',
  'a viewer sees the member name');

select tests.act_as('admin.b@test.esta.test');
select is_empty(format('select 1 from public.property_activity(%L)', :'property_a'),
  'a member of another household reads no row of it');

reset role;
delete from public.test_clock;
select tests.act_as('member.a@test.esta.test');
update public.properties set nickname = 'Đất vườn Demo' where id = :'property_a';
reset role;
select ok((select at from public.audit_log order by id desc limit 1) > '2026-10-08'::timestamptz,
  'without a test clock row the audit row takes the wall clock');

select ok(not has_function_privilege('anon', 'public.property_activity(uuid, int)', 'execute'),
  'anon cannot call the history function');

select * from finish();
rollback;
