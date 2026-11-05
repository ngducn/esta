begin;
\ir _harness.psql

select plan(12);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as admin_a, tests.user_id('admin.b@test.esta.test') as admin_b \gset
select id as admin_a_member from public.household_members where household_id = :'a' and role = 'admin' \gset
select id as member_a_member from public.household_members where household_id = :'a' and role = 'member' \gset
select id as viewer_a_member from public.household_members where household_id = :'a' and role = 'viewer' \gset
select id as admin_b_member from public.household_members where household_id = :'b' and role = 'admin' \gset

select tests.act_as_service('{"x-esta-actor": "system:test"}');
update public.household_members set is_operator = true where id = :'admin_a_member';
insert into public.household_members (household_id, invited_email, role) values (:'a', 'second.admin.a@test.esta.test', 'admin');
reset role;
select tests.create_user('second.admin.a@test.esta.test') as second_user \gset
select tests.act_as_service('{"x-esta-actor": "system:test"}');
update public.household_members set user_id = :'second_user' where invited_email = 'second.admin.a@test.esta.test';
reset role;
select id as second_admin_member from public.household_members where invited_email = 'second.admin.a@test.esta.test' \gset

select tests.act_as('viewer.a@test.esta.test');
select is_empty(format($$ update public.household_members set role = 'admin' where id = %L returning 1 $$, :'viewer_a_member'),
  'a viewer cannot promote itself');
select is_empty(format($$ delete from public.household_members where id = %L returning 1 $$, :'member_a_member'),
  'a viewer cannot remove a member');
reset role;

select tests.act_as('member.a@test.esta.test');
select is_empty(format($$ update public.household_members set role = 'viewer' where id = %L returning 1 $$, :'viewer_a_member'),
  'a member cannot change a role');
reset role;

select tests.act_as('admin.b@test.esta.test');
select is_empty(format($$ select 1 from public.household_members where household_id = %L $$, :'a'),
  'an admin of another household reads none of this household''s members');
select is_empty(format($$ update public.household_members set role = 'viewer' where id = %L returning 1 $$, :'member_a_member'),
  'an admin of another household cannot change a role here');
select is_empty(format($$ delete from public.household_members where id = %L returning 1 $$, :'viewer_a_member'),
  'an admin of another household cannot remove a member here');
select throws_ok(format($$ select public.invite_member(%L, 'x@test.esta.test', 'viewer') $$, :'a'),
  '42501', 'only an admin of the household can invite', 'an admin of another household cannot invite here');
reset role;

select tests.act_as('second.admin.a@test.esta.test');
select throws_ok(format($$ update public.household_members set role = 'member' where id = %L $$, :'admin_a_member'),
  '42501', 'only an operator of the household can change or remove an operator', 'an admin who is not the operator cannot demote the operator');
select throws_ok(format($$ delete from public.household_members where id = %L $$, :'admin_a_member'),
  '42501', 'only an operator of the household can change or remove an operator', 'an admin who is not the operator cannot remove the operator');
select lives_ok(format($$ update public.household_members set role = 'viewer' where id = %L $$, :'member_a_member'),
  'an admin changes another member''s role');
reset role;

select tests.act_as('admin.a@test.esta.test');
select lives_ok(format($$ update public.household_members set role = 'member' where id = %L $$, :'second_admin_member'),
  'the operator demotes another admin while it stays admin itself');
select throws_ok(format($$ update public.household_members set role = 'member' where id = %L $$, :'admin_a_member'),
  '23514', 'a household keeps at least one admin who has signed in', 'the last admin cannot be demoted');
reset role;

select * from finish();
rollback;
