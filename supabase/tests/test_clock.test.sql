begin;
\ir _harness.psql

delete from public.test_clock;

select plan(10);

select tests.create_household('a') as a \gset

select lives_ok($$ insert into public.test_clock (frozen_now) values ('2026-10-07T09:00:00+07:00') $$,
  'the first row inserts');
select throws_ok($$ insert into public.test_clock (frozen_now) values ('2026-10-08T09:00:00+07:00') $$,
  '23505', null, 'a second row is refused');
select throws_ok($$ insert into public.test_clock (id, frozen_now) values (false, '2026-10-08T09:00:00+07:00') $$,
  '23514', null, 'the key cannot be false');

select tests.act_as('member.a@test.esta.test');
select results_eq($$ select frozen_now from public.test_clock $$,
  $$ values ('2026-10-07T02:00:00Z'::timestamptz) $$, 'authenticated reads the frozen time');
select throws_ok($$ insert into public.test_clock (frozen_now) values (now()) $$,
  '42501', null, 'authenticated cannot insert');
select throws_ok($$ update public.test_clock set frozen_now = now() $$, '42501', null, 'authenticated cannot update');
select throws_ok($$ delete from public.test_clock $$, '42501', null, 'authenticated cannot delete');
reset role;

set local role anon;
select is((select count(*) from public.test_clock), 1::bigint, 'anon reads the row');
reset role;

select tests.act_as_service();
select lives_ok($$ update public.test_clock set frozen_now = '2026-10-08T09:00:00+07:00' $$,
  'the service role moves the clock');
select lives_ok($$ delete from public.test_clock $$, 'the service role turns the clock off');
reset role;

select * from finish();
rollback;
