begin;
\ir _harness.psql

select plan(22);

select tests.create_household('a') as a \gset
select id as a_admin from public.household_members where household_id = :'a' and role = 'admin' \gset

select tests.act_as('viewer.a@test.esta.test');

select ok(private.is_member(:'a', 'viewer'), 'the viewer ranks as viewer');
select ok(not private.is_member(:'a', 'member'), 'the viewer does not rank as member');

select tests.sees_household('public.households', :'a', true, 'id');
select tests.cannot_write('public.households', :'a',
  $$ insert into public.households (name) values ('Second home') $$, 'id');

select tests.sees_household('public.household_members', :'a', true);
select tests.cannot_write('public.household_members', :'a',
  format($$ insert into public.household_members (household_id, invited_email) values (%L, 'friend@test.esta.test') $$, :'a'));

select tests.sees_household('public.household_settings', :'a', true);
select tests.cannot_write('public.household_settings', :'a',
  format($$ insert into public.household_settings (household_id) values (%L) $$, :'a'));

select tests.sees_household('public.parties', :'a', true);
select tests.cannot_write('public.parties', :'a',
  format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'Tenant') $$, :'a'));

select tests.sees_household('public.notification_preferences', :'a', true);
select tests.cannot_write('public.notification_preferences', :'a',
  format($$ insert into public.notification_preferences (household_id, member_id, channel)
            values (%L, %L, 'email') $$, :'a', :'a_admin'));

reset role;
select * from finish();
rollback;
