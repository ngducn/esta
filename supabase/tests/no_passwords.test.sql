begin;
\ir _harness.psql

select plan(5);

select tests.create_user('password.holder@test.esta.test') as holder \gset

select is(
  (select encrypted_password from auth.users where id = :'holder'), '',
  'a new user holds no password');

update auth.users set encrypted_password = '$2a$10$demo.hash.one' where id = :'holder';
select is(
  (select encrypted_password from auth.users where id = :'holder'), '',
  'setting a password on an existing user leaves none');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        'signup.with.password@test.esta.test', '$2a$10$demo.hash.two', now(), now());
select is(
  (select encrypted_password from auth.users where email = 'signup.with.password@test.esta.test'), '',
  'a signup with a password stores none');

select ok(not has_function_privilege('authenticated', 'private.blank_passwords()', 'execute'),
  'a signed-in user cannot run the password backfill');
select is(
  (select count(*)::int from auth.users where encrypted_password is distinct from ''), 0,
  'no user holds a password after the migrations and the seed');

select * from finish();
rollback;
