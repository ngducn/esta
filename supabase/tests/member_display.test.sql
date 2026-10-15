begin;
\ir _harness.psql

select plan(18);

select tests.create_household('a') as a \gset
select tests.create_household('b') as b \gset
select id as a_viewer from public.household_members where household_id = :'a' and role = 'viewer' \gset
select id as a_admin from public.household_members where household_id = :'a' and role = 'admin' \gset
select id as b_viewer from public.household_members where household_id = :'b' and role = 'viewer' \gset

select tests.act_as('viewer.a@test.esta.test');

select lives_ok(
  $$ select public.update_my_display_settings('en', 130, 'compact') $$,
  'a viewer saves its own display settings');

reset role;
select results_eq(
  format($$ select locale, text_scale::int, density, role::text, is_operator
            from public.household_members where id = %L $$, :'a_viewer'),
  $$ values ('en', 130, 'compact', 'viewer', false) $$,
  'the viewer row holds the new display settings and keeps its role');
select results_eq(
  format($$ select locale, text_scale::int, density from public.household_members where id in (%L, %L) order by id $$,
         :'a_admin', :'b_viewer'),
  $$ values ('vi', 100, 'comfortable'), ('vi', 100, 'comfortable') $$,
  'another member of the household and a member of another household keep theirs');

select tests.act_as('viewer.a@test.esta.test');

select is_empty(
  $$ update public.household_members set role = 'admin' where user_id = (select auth.uid()) returning 1 $$,
  'a viewer cannot raise its own role');
select is_empty(
  $$ update public.household_members set text_scale = 115 where user_id = (select auth.uid()) returning 1 $$,
  'a viewer writes display columns only through the function');
select is_empty(
  format($$ update public.household_members set locale = 'en' where id = %L returning 1 $$, :'a_admin'),
  'a viewer cannot change another member row');

select throws_ok($$ select public.update_my_display_settings('fr', 100, 'comfortable') $$, '23514', null,
  'an unknown locale is refused');
select throws_ok($$ select public.update_my_display_settings('vi', 120, 'comfortable') $$, '23514', null,
  'a text scale outside 100, 115 and 130 is refused');
select throws_ok($$ select public.update_my_display_settings('vi', 100, 'tiny') $$, '23514', null,
  'an unknown density is refused');
select throws_ok($$ select public.update_my_display_settings(null, 100, 'comfortable') $$, '23502', null,
  'a missing locale is refused');

select tests.cannot_write('public.household_settings', :'a',
  format($$ insert into public.household_settings (household_id) values (%L) $$, :'a'));
select tests.cannot_write('public.parties', :'a',
  format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'Tenant') $$, :'a'));

reset role;
select ok(not has_function_privilege('anon', 'public.update_my_display_settings(text, int, text)', 'execute'),
  'a signed-out visitor cannot call the function');
select is(
  (select count(*)::int from public.household_members where household_id in (:'a', :'b') and locale = 'en'), 1,
  'only the viewer row changed');

select * from finish();
rollback;
