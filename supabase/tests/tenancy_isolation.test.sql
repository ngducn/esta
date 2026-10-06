begin;
\ir _harness.psql

select plan(36);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select id as b_member from public.household_members where household_id = :'b' and role = 'admin' \gset

select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity $$,
  'every table in public has RLS enabled'
);
select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid) $$,
  'every table in public has at least one policy'
);

update public.household_members set is_operator = true where invited_email = 'admin.a@test.esta.test';

select tests.act_as('admin.a@test.esta.test');

select tests.sees_household('public.households', :'a', true, 'id');
select tests.sees_household('public.households', :'b', false, 'id');
select tests.cannot_write('public.households', :'b',
  format($$ insert into public.households (id, name) values (%L, 'Taken') $$, :'b'), 'id');

select tests.sees_household('public.household_members', :'a', true);
select tests.sees_household('public.household_members', :'b', false);
select tests.cannot_write('public.household_members', :'b',
  format($$ insert into public.household_members (household_id, invited_email, role)
            values (%L, 'intruder@test.esta.test', 'admin') $$, :'b'));

select tests.sees_household('public.household_settings', :'a', true);
select tests.sees_household('public.household_settings', :'b', false);
select tests.cannot_write('public.household_settings', :'b',
  format($$ insert into public.household_settings (household_id) values (%L) $$, :'b'));

select tests.sees_household('public.parties', :'a', true);
select tests.sees_household('public.parties', :'b', false);
select tests.cannot_write('public.parties', :'b',
  format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'Intruder') $$, :'b'));

select tests.sees_household('public.notification_preferences', :'a', true);
select tests.sees_household('public.notification_preferences', :'b', false);
select tests.cannot_write('public.notification_preferences', :'b',
  format($$ insert into public.notification_preferences (household_id, member_id, channel)
            values (%L, %L, 'email') $$, :'b', :'b_member'));

select throws_ok(
  format($$ update public.parties set household_id = %L where household_id = %L $$, :'b', :'a'),
  '23514', 'parties rows cannot move to another household',
  'an admin cannot move its own row into another household'
);

select ok(private.is_operator(:'a'), 'an operator member is an operator of its household');
select ok(not private.is_operator(:'b'), 'an operator of A is not an operator of B');

reset role;
select tests.act_as('member.a@test.esta.test');

select ok(not private.is_operator(:'a'), 'a member without the flag is not an operator');
select is_empty(
  $$ update public.household_members set role = 'admin', is_operator = true
     where user_id = (select auth.uid()) returning 1 $$,
  'a member cannot promote itself'
);

select isnt_empty(
  format($$ update public.parties set notes = 'ok' where household_id = %L returning 1 $$, :'a'),
  'a member updates its household''s parties'
);
select is_empty(
  format($$ update public.households set name = 'Renamed' where id = %L returning 1 $$, :'a'),
  'a member cannot rename the household, which needs admin'
);
select throws_ok(
  format($$ insert into public.household_members (household_id, invited_email, role)
            values (%L, 'friend@test.esta.test', 'admin') $$, :'a'),
  '42501', null,
  'a member cannot add members, which needs admin'
);

reset role;
set local role anon;
select throws_ok('select 1 from public.households', '42501', null, 'anon has no access to households');

reset role;
select * from finish();
rollback;
