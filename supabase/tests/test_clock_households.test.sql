begin;
\ir _harness.psql

delete from public.test_clock;

select plan(8);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
insert into private.local_stack default values on conflict do nothing;

insert into public.test_clock (for_household, frozen_now) values
  (:'a', '2026-10-07T09:00:00+07:00'),
  (:'b', '2026-11-02T09:00:00+07:00');

select tests.act_as('admin.a@test.esta.test');
reset role;
select is(private.audit_now(), '2026-10-07T09:00:00+07:00'::timestamptz, 'a member of household a reads a''s date');
reset role;
select tests.act_as('admin.b@test.esta.test');
reset role;
select is(private.audit_now(), '2026-11-02T09:00:00+07:00'::timestamptz, 'a member of household b reads b''s date, not a''s');
select is(private.business_date(private.audit_now()), '2026-11-02'::date, 'the business date follows household b');
reset role;

select throws_ok(format($$ insert into public.test_clock (for_household, frozen_now) values (%L, now()) $$, :'a'),
  '23505', null, 'a household has one frozen date');
select lives_ok($$ insert into public.test_clock (frozen_now) values ('2026-12-01T09:00:00+07:00') $$, 'one global row beside the household rows');

select tests.act_as('admin.a@test.esta.test');
reset role;
select is(private.audit_now(), '2026-10-07T09:00:00+07:00'::timestamptz, 'the household row wins over the global row');
reset role;

delete from public.test_clock where for_household = :'b';
select tests.act_as('admin.b@test.esta.test');
reset role;
select is(private.audit_now(), '2026-12-01T09:00:00+07:00'::timestamptz, 'a household with no row falls back to the global row');
reset role;

delete from private.local_stack;
select tests.act_as('admin.a@test.esta.test');
reset role;
select is(private.audit_now(), now(), 'without the local stack marker a household row changes nothing');
reset role;

select * from finish();
rollback;
