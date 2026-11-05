begin;
\ir _harness.psql

select plan(9);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select tests.act_as('admin.a@test.esta.test');
select is((select onboarding from public.household_settings where household_id = :'a'), '{}'::jsonb, 'a new household starts with an empty onboarding setting');
select lives_ok(format($$ update public.household_settings set onboarding = '{"dismissed_at":"2026-11-06T09:00:00+07:00"}' where household_id = %L $$, :'a'),
  'an admin stores dismissed_at');
select is((select onboarding ->> 'dismissed_at' from public.household_settings where household_id = :'a'), '2026-11-06T09:00:00+07:00', 'the dismissal reads back');
select throws_ok(format($$ update public.household_settings set onboarding = '[]' where household_id = %L $$, :'a'), '23514', null, 'the setting must be an object');
select throws_ok(format($$ update public.household_settings set onboarding = '{"dismissed_at":"x","other":1}' where household_id = %L $$, :'a'), '23514', null, 'the setting holds only dismissed_at');
select is((select count(*) from public.household_settings where household_id = :'b'), 0::bigint, 'an admin of A cannot read the settings of B');
select is_empty(format($$ update public.household_settings set onboarding = '{"dismissed_at":"x"}' where household_id = %L returning 1 $$, :'b'),
  'an admin of A cannot write the settings of B');

select tests.act_as('viewer.a@test.esta.test');
select is_empty(format($$ update public.household_settings set onboarding = '{}' where household_id = %L returning 1 $$, :'a'), 'a viewer cannot write onboarding');

select tests.act_as('member.a@test.esta.test');
select is_empty(format($$ update public.household_settings set onboarding = '{}' where household_id = %L returning 1 $$, :'a'), 'a member cannot write onboarding');

select * from finish();
rollback;
