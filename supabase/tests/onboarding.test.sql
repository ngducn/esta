begin;
\ir _harness.psql

select plan(40);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.create_user('new.user@test.esta.test') as new_user \gset
select tests.create_user('Mixed.Case@Test.Esta.Test') as mixed_user \gset
select tests.create_user('op.a@test.esta.test') as op_user \gset
select tests.create_user('unconfirmed@test.esta.test') as unconfirmed_user \gset
update auth.users set email_confirmed_at = null where id = :'unconfirmed_user';

select tests.act_as_service('{"x-esta-actor": "system:test"}');
insert into public.household_members (household_id, user_id, invited_email, role, is_operator)
values (:'a', :'op_user', 'op.a@test.esta.test', 'admin', true);
insert into public.household_members (household_id, invited_email, role, is_operator)
values (:'a', 'pending.op.a@test.esta.test', 'member', true);
reset role;
select id as op_row from public.household_members where invited_email = 'op.a@test.esta.test' \gset
select id as pending_op_row from public.household_members where invited_email = 'pending.op.a@test.esta.test' \gset

-- invite_member

select tests.act_as('member.a@test.esta.test');
select throws_ok(
  format($$ select public.invite_member(%L, 'x@test.esta.test', 'viewer') $$, :'a'),
  '42501', 'only an admin of the household can invite', 'a member cannot invite');
reset role;
select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  format($$ select public.invite_member(%L, 'x@test.esta.test', 'viewer') $$, :'a'),
  '42501', 'only an admin of the household can invite', 'a viewer cannot invite');
reset role;
select tests.act_as('admin.b@test.esta.test');
select throws_ok(
  format($$ select public.invite_member(%L, 'x@test.esta.test', 'viewer') $$, :'a'),
  '42501', 'only an admin of the household can invite', 'an admin of another household cannot invite');
reset role;

select tests.act_as('admin.a@test.esta.test');
select public.invite_member(:'a', '  New.User@Test.Esta.Test ', 'viewer') as invite \gset
select is(
  (select row(invited_email, role::text, user_id, is_operator)::text from public.household_members where id = :'invite'),
  row('new.user@test.esta.test', 'viewer', null::uuid, false)::text,
  'an admin invites by email, stored trimmed and lower case, unclaimed and never operator');
select is(public.invite_member(:'a', 'new.user@test.esta.test', 'viewer'), :'invite'::uuid,
  'repeating the same invite returns the same row');
select throws_ok(
  format($$ select public.invite_member(%L, 'new.user@test.esta.test', 'admin') $$, :'a'),
  '23505', null, 'an invite cannot be re-sent with another role');
select throws_ok(
  format($$ select public.invite_member(%L, 'member.a@test.esta.test', 'member') $$, :'a'),
  '23505', null, 'an admin cannot re-invite a claimed member');
select throws_ok(
  format($$ select public.invite_member(%L, 'pending.op.a@test.esta.test', 'member') $$, :'a'),
  '23505', null, 'a non-operator admin cannot take over an unclaimed operator invite through invite_member');
select lives_ok(
  format($$ select public.invite_member(%L, 'mixed.case@test.esta.test', 'member') $$, :'a'),
  'an admin invites a second address');
reset role;

-- claim_pending_invites

select tests.act_as('new.user@test.esta.test');
select is(public.claim_pending_invites(), 1, 'the first claim links one invite');
select is((select user_id from public.household_members where id = :'invite'), :'new_user'::uuid,
  'the invite row now belongs to the signed-in user');
select is(public.claim_pending_invites(), 0, 'a second claim links nothing');
select is((select count(*)::int from public.household_members where user_id = :'new_user'), 1,
  'claiming twice leaves exactly one row for the user');
select is((select role::text from public.household_members where id = :'invite'), 'viewer',
  'the claimed row keeps the invited role');
reset role;

select tests.act_as('Mixed.Case@Test.Esta.Test');
select is(public.claim_pending_invites(), 1, 'a claim matches the invite whatever the case of the sign-in email');
reset role;

select tests.act_as('unconfirmed@test.esta.test');
select throws_ok($$ select public.claim_pending_invites() $$, '42501', null,
  'a user whose email is not confirmed claims nothing');
reset role;

select tests.act_as_service('{"x-esta-actor": "system:test"}');
insert into public.household_members (household_id, invited_email, role)
values (:'b', 'new.user@test.esta.test', 'admin');
reset role;
select tests.act_as('admin.b@test.esta.test');
select throws_ok(
  format($$ update public.household_members set user_id = %L where invited_email = 'new.user@test.esta.test' $$, :'new_user'),
  '42501', null, 'a user session still cannot link a row to a user directly');
reset role;

-- create_household

select tests.act_as('new.user@test.esta.test');
select throws_ok($$ select public.create_household('Gia đình Thứ Hai', 'Demo') $$, '23505', null,
  'a user who already belongs to a household cannot create another');
reset role;

select tests.create_user('fresh@test.esta.test') as fresh_user \gset
select tests.act_as('fresh@test.esta.test');
select throws_ok($$ select public.create_household('  ', 'Demo') $$, '22023', null, 'a blank household name is refused');
select throws_ok($$ select public.create_household('Gia đình Mới Demo', '') $$, '22023', null, 'a blank display name is refused');
select public.create_household('  Gia đình Mới Demo ', ' Demo Hai ') as created \gset
select is((select name from public.households where id = :'created'), 'Gia đình Mới Demo', 'the household is created with a trimmed name');
select is(
  (select row(role::text, is_operator, display_name, invited_email, user_id)::text
   from public.household_members where household_id = :'created'),
  row('admin', true, 'Demo Hai', 'fresh@test.esta.test', :'fresh_user'::uuid)::text,
  'the creator is the claimed admin operator of the new household');
select is((select count(*)::int from public.household_settings where household_id = :'created'), 1,
  'the new household has its settings row');
select is((select count(*)::int from public.household_members where household_id = :'created'), 1,
  'the new household has exactly one member');
select throws_ok($$ select public.create_household('Gia đình Mới Demo', 'Demo Hai') $$, '23505', null,
  'submitting onboarding twice creates no second household');
reset role;

-- set_my_locale

select tests.act_as('fresh@test.esta.test');
select public.set_my_locale('en');
select is((select locale from public.household_members where user_id = :'fresh_user'), 'en', 'a member sets its own locale');
select throws_ok($$ select public.set_my_locale('fr') $$, '23514', null, 'an unknown locale is refused');
reset role;
select is((select count(*)::int from public.household_members where locale = 'en'), 1, 'set_my_locale touches only the caller''s rows');

-- issue #8 and #9: operator rows

select tests.act_as('admin.a@test.esta.test');
select throws_ok(
  format($$ delete from public.household_members where id = %L $$, :'op_row'),
  '42501', 'only an operator of the household can change or remove an operator',
  'a non-operator admin cannot delete the claimed operator row (#8)');
select throws_ok(
  format($$ update public.household_members set invited_email = 'admin.a+op@test.esta.test' where id = %L $$, :'pending_op_row'),
  '42501', 'only an operator of the household can change or remove an operator',
  'a non-operator admin cannot redirect an unclaimed operator invite (#9)');
select throws_ok(
  format($$ update public.household_members set role = 'viewer' where id = %L $$, :'op_row'),
  '42501', 'only an operator of the household can change or remove an operator',
  'a non-operator admin cannot demote the operator');
select lives_ok(
  format($$ delete from public.household_members where id = %L $$, :'invite'),
  'a non-operator admin still removes an ordinary member');
reset role;

select tests.act_as('op.a@test.esta.test');
select lives_ok(
  format($$ update public.household_members set invited_email = 'pending.op2.a@test.esta.test' where id = %L $$, :'pending_op_row'),
  'an operator edits an unclaimed operator invite');
select lives_ok(
  format($$ delete from public.household_members where id = %L $$, :'pending_op_row'),
  'an operator removes an operator invite');
reset role;

-- issue #16: reference data is for signed-in users only

set local role anon;
select throws_ok($$ select 1 from public.admin_units limit 1 $$, '42501', null, 'anon cannot read admin_units');
select throws_ok($$ select 1 from public.admin_unit_legacy_map limit 1 $$, '42501', null, 'anon cannot read admin_unit_legacy_map');
reset role;
-- Calling a function the role may not execute crashes the 17.6.1.106 image's backend, so these
-- assert the privilege instead of calling.
select ok(not has_function_privilege('anon', 'public.suggest_current_unit(text)', 'execute'),
  'anon cannot call suggest_current_unit');
select ok(has_function_privilege('authenticated', 'public.suggest_current_unit(text)', 'execute'),
  'a signed-in user still calls suggest_current_unit');
select ok(
  not has_sequence_privilege('anon', 'public.admin_unit_legacy_map_id_seq', 'usage,update')
  and not has_sequence_privilege('authenticated', 'public.admin_unit_legacy_map_id_seq', 'usage,update'),
  'no API role can draw from the legacy map sequence');
select ok(
  not has_function_privilege('anon', 'public.create_household(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.invite_member(uuid, text, public.member_role)', 'execute')
  and not has_function_privilege('anon', 'public.set_my_locale(text)', 'execute')
  and not has_function_privilege('anon', 'public.claim_pending_invites()', 'execute'),
  'anon cannot execute the onboarding functions');

select * from finish();
rollback;
