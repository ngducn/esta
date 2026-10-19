begin;
\ir _harness.psql

select plan(10);

select tests.create_household('a') as a \gset

-- Three Dĩ An rooms on the database clock's 2026-10-07, each billed by calendar month at 3.000.000 ₫ on the 1st and
-- collected to its end. Phòng 5 and 6 ended on 31/07, so a renewal starts on 01/08, before today; Phòng 8 runs to 31/10,
-- so its renewal starts on 01/11, after today. A renewal bills as activation does: from the current period on, never
-- for a period that ended before today.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room'),
  ('00000000-0000-4000-8000-000000000a16', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 6', 'room'),
  ('00000000-0000-4000-8000-000000000a18', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 8', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Trần Thị Bình Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  paid_through_date, deposit_vnd, status
)
select ('00000000-0000-4000-8000-00000000e0' || k || '1')::uuid, :'a', '00000000-0000-4000-8000-0000000000a1',
  ('00000000-0000-4000-8000-000000000a1' || k)::uuid, '00000000-0000-4000-8000-00000000a0a1', start_date, end_date, 3000000, 1,
  'calendar_month', end_date, 3000000, status
from (values
  ('5', date '2026-01-01', date '2026-07-31', 'ended'),
  ('6', date '2026-01-01', date '2026-07-31', 'ended'),
  ('8', date '2025-11-01', date '2026-10-31', 'active')
) as room (k, start_date, end_date, status);

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

-- Every invoice of the lease that renewed one lease, with its rent line, in period order.
create temporary view renewal_billed as
  select r.renewal_of_lease_id, i.period_start, i.period_end, i.due_date, i.status, l.amount_vnd
  from public.leases r
  join public.invoices i on i.lease_id = r.id
  join public.invoice_lines l on l.invoice_id = i.id;

select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select public.renew_lease('00000000-0000-4000-8000-00000000e051', 0, '2027-07-31') $$,
  'Phòng 5 is renewed from 01/08/2026 with nothing said about what was collected');
select throws_ok(
  $$ select public.renew_lease('00000000-0000-4000-8000-00000000e061', 0, '2027-07-31', '2026-07-31') $$,
  '22023', 'ESTA_PAID_THROUGH_BEFORE_START', 'a paid-through date before the renewal''s start is refused, as at activation');
select lives_ok($$ select public.renew_lease('00000000-0000-4000-8000-00000000e061', 0, '2027-07-31', '2026-10-04') $$,
  'Phòng 6 is renewed from 01/08/2026, paid through 04/10/2026');
select lives_ok($$ select public.renew_lease('00000000-0000-4000-8000-00000000e081', 0, '2027-10-31') $$,
  'Phòng 8 is renewed from 01/11/2026');
select tests.clear_request();
reset role;

select results_eq(
  $$ select period_start, period_end, due_date, status, amount_vnd from renewal_billed
     where renewal_of_lease_id = '00000000-0000-4000-8000-00000000e051' order by period_start $$,
  $$ values (date '2026-10-01', date '2026-10-31', date '2026-10-01', 'issued', 3000000::bigint),
            (date '2026-11-01', date '2026-11-30', date '2026-11-01', 'draft', 3000000::bigint) $$,
  'a renewal from a past start with no paid-through date bills nothing for August or September, issues October and drafts November');
select results_eq(
  $$ select period_start, period_end, due_date, status, amount_vnd from renewal_billed
     where renewal_of_lease_id = '00000000-0000-4000-8000-00000000e061' order by period_start $$,
  $$ values (date '2026-10-05', date '2026-10-31', date '2026-10-05', 'issued', 2612903::bigint),
            (date '2026-11-01', date '2026-11-30', date '2026-11-01', 'draft', 3000000::bigint) $$,
  'paid through 04/10/2026, it bills from 05/10, 27 of 31 days of October');
select results_eq(
  $$ select paid_through_date from public.leases where renewal_of_lease_id = '00000000-0000-4000-8000-00000000e061' $$,
  $$ values (date '2026-10-04') $$,
  'the renewal keeps its paid-through date');
select results_eq(
  $$ select period_start, period_end, due_date, status, amount_vnd from renewal_billed
     where renewal_of_lease_id = '00000000-0000-4000-8000-00000000e081' order by period_start $$,
  $$ values (date '2026-11-01', date '2026-11-30', date '2026-11-01', 'draft', 3000000::bigint) $$,
  'a renewal starting after today drafts only its first period, as before');
select results_eq(
  $$ select paid_through_date from public.leases where renewal_of_lease_id = '00000000-0000-4000-8000-00000000e081' $$,
  $$ values (null::date) $$,
  'and has no paid-through date');

select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-10-08', '2026-10-08T00:30:00+07:00') $$, :'a'),
  $$ values (0, 0) $$,
  'the nightly run on 08/10 finds nothing left to draft or issue');
select tests.clear_request();
reset role;

select * from finish();
rollback;
