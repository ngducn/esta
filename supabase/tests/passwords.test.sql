begin;
\ir _harness.psql

select plan(16);

select tests.create_user('confirmed@test.esta.test') as confirmed \gset
update auth.users set encrypted_password = '$2a$10$demo.hash.one' where id = :'confirmed';
select is(
  (select encrypted_password from auth.users where id = :'confirmed'), '$2a$10$demo.hash.one',
  'a confirmed user keeps a password set after confirmation');

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'seeded.confirmed@test.esta.test', now(), '$2a$10$demo.hash.two', now(), now());
select is(
  (select encrypted_password from auth.users where email = 'seeded.confirmed@test.esta.test'), '$2a$10$demo.hash.two',
  'an account created already confirmed keeps its password');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'pending.invitee@test.esta.test', '$2a$10$demo.hash.squatter', now(), now());
select tests.user_id('pending.invitee@test.esta.test') as pending \gset
select is(
  (select encrypted_password from auth.users where id = :'pending'), '',
  'a signup whose email is not confirmed stores no password');

update auth.users set encrypted_password = '$2a$10$demo.hash.squatter' where id = :'pending';
select is(
  (select encrypted_password from auth.users where id = :'pending'), '',
  'a password written while the email is unconfirmed is dropped');

select tests.create_household('a') as a \gset
select tests.act_as_service('{"x-esta-actor": "system:test"}');
insert into public.household_members (household_id, invited_email, role)
values (:'a', 'pending.invitee@test.esta.test', 'admin');
reset role;
select id as invite from public.household_members where invited_email = 'pending.invitee@test.esta.test' \gset

select tests.act_as('pending.invitee@test.esta.test');
select throws_ok($$ select public.claim_pending_invites() $$, '42501', null,
  'an account whose email is not confirmed cannot claim its invite');
select tests.sees_household('public.households', :'a', false, 'id');
select tests.sees_household('public.household_members', :'a', false);
select throws_ok($$ select public.create_household('Gia đình Chiếm Demo', 'Demo') $$, '42501', null,
  'an account whose email is not confirmed cannot create a household');
reset role;
select is((select user_id from public.household_members where id = :'invite'), null,
  'the refused claim leaves the invite unclaimed');

update auth.users
set email_confirmed_at = now(), encrypted_password = '$2a$10$demo.hash.squatter'
where id = :'pending';
select is(
  (select encrypted_password from auth.users where id = :'pending'), '',
  'confirming the email and writing a password in one step keeps no password');
select isnt(
  (select email_confirmed_at from auth.users where id = :'pending'), null,
  'that step still confirms the email');

select tests.act_as('pending.invitee@test.esta.test');
select is(public.claim_pending_invites(), 1, 'once the email is confirmed, the invite is claimed');
select tests.sees_household('public.households', :'a', true, 'id');
reset role;

update auth.users set encrypted_password = '$2a$10$demo.hash.owner' where id = :'pending';
select is(
  (select encrypted_password from auth.users where id = :'pending'), '$2a$10$demo.hash.owner',
  'the owner sets a password after confirming, and it is kept');

select ok(not has_function_privilege('authenticated', 'private.drop_unconfirmed_password()', 'execute'),
  'a signed-in user cannot run the password trigger function');
select ok(not exists (select 1 from pg_trigger where tgname = 'drop_password' and tgrelid = 'auth.users'::regclass),
  'the trigger that dropped every password is gone');

select * from finish();
rollback;
