begin;
\ir _harness.psql

select plan(12);

select tests.create_household('a') as a \gset

-- Four Dĩ An rooms on the database clock's 2026-10-07, each billed by calendar month at 3.000.000 ₫ and holding the
-- drafts the nightly job left: Phòng 5, 8 and 9 are metered (issued 10 days into the period), Phòng 6 is billed on the
-- 1st and the run that should have issued its October draft never came. Phòng 9 was paid through 03/10.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room'),
  ('00000000-0000-4000-8000-000000000a16', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 6', 'room'),
  ('00000000-0000-4000-8000-000000000a18', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 8', 'room'),
  ('00000000-0000-4000-8000-000000000a19', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 9', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Trần Thị Bình Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, paid_through_date, deposit_vnd, status
)
select ('00000000-0000-4000-8000-00000000e0' || k || '1')::uuid, :'a', '00000000-0000-4000-8000-0000000000a1',
  ('00000000-0000-4000-8000-000000000a1' || k)::uuid, '00000000-0000-4000-8000-00000000a0a1', '2026-09-01', '2027-08-31', 3000000, 1,
  'calendar_month', mode, offset_days, paid_through, 3000000, 'active'
from (values
  ('5', 'metered_by_owner', 10, date '2026-09-30'),
  ('6', 'tenant_direct', 0, date '2026-09-30'),
  ('8', 'metered_by_owner', 10, date '2026-09-30'),
  ('9', 'metered_by_owner', 10, date '2026-10-03')
) as room (k, mode, offset_days, paid_through);
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status)
select ('00000000-0000-4000-8000-0000000f00' || k || m)::uuid, :'a', ('00000000-0000-4000-8000-00000000e0' || k || '1')::uuid,
  period_start, period_end, due, due, 'draft'
from (values
  ('5', '1', date '2026-10-01', date '2026-10-31', date '2026-10-11', 3000000),
  ('5', '2', date '2026-11-01', date '2026-11-30', date '2026-11-11', 3000000),
  ('6', '1', date '2026-10-01', date '2026-10-31', date '2026-10-01', 3000000),
  ('6', '2', date '2026-11-01', date '2026-11-30', date '2026-11-01', 3000000),
  ('8', '1', date '2026-10-01', date '2026-10-31', date '2026-10-11', 3000000),
  ('8', '2', date '2026-11-01', date '2026-11-30', date '2026-11-11', 3000000),
  ('9', '1', date '2026-10-04', date '2026-10-31', date '2026-10-14', 2709677),
  ('9', '2', date '2026-11-01', date '2026-11-30', date '2026-11-11', 3000000)
) as draft (k, m, period_start, period_end, due, amount);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select :'a', ('00000000-0000-4000-8000-0000000f00' || k || m)::uuid, 'rent', amount, amount
from (values ('5', '1', 3000000), ('5', '2', 3000000), ('6', '1', 3000000), ('6', '2', 3000000),
             ('8', '1', 3000000), ('8', '2', 3000000), ('9', '1', 2709677), ('9', '2', 3000000)) as line (k, m, amount);

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

-- Every invoice of one lease with its rent line, in period order.
create temporary view billed as
  select i.household_id, i.lease_id, i.period_start, i.period_end, i.due_date, i.issue_on, i.status, l.amount_vnd
  from public.invoices i join public.invoice_lines l on l.invoice_id = i.id;

select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select public.terminate_lease('00000000-0000-4000-8000-00000000e051', '2026-10-05', 'Người thuê Demo chuyển đi') $$,
  'Phòng 5 ends on 05/10/2026, two days ago');
select lives_ok($$ select public.terminate_lease('00000000-0000-4000-8000-00000000e061', '2026-10-05', 'Người thuê Demo chuyển đi') $$,
  'Phòng 6 ends on 05/10/2026');
select lives_ok($$ select public.terminate_lease('00000000-0000-4000-8000-00000000e081', '2026-10-07', 'Người thuê Demo chuyển đi') $$,
  'Phòng 8 ends today');
select lives_ok($$ select public.terminate_lease('00000000-0000-4000-8000-00000000e091', '2026-10-05', 'Người thuê Demo chuyển đi') $$,
  'Phòng 9 ends on 05/10/2026');
select tests.clear_request();
reset role;

select results_eq(
  $$ select period_start, period_end, due_date, issue_on, status, amount_vnd from billed where lease_id = '00000000-0000-4000-8000-00000000e051' order by period_start $$,
  $$ values (date '2026-10-01', date '2026-10-05', date '2026-10-11', date '2026-10-11', 'draft', 483871::bigint) $$,
  'a past date inside an unissued period leaves one draft for 01/10 to 05/10, 5 of 31 days, issued on its usual 11/10');
select results_eq(
  $$ select period_start, period_end, due_date, issue_on, status, amount_vnd from billed where lease_id = '00000000-0000-4000-8000-00000000e061' order by period_start $$,
  $$ values (date '2026-10-01', date '2026-10-05', date '2026-10-01', date '2026-10-01', 'issued', 483871::bigint) $$,
  'a lease billed on the 1st issues the shortened October at once, since its issue date has passed');
select results_eq(
  $$ select period_start, period_end, due_date, issue_on, status, amount_vnd from billed where lease_id = '00000000-0000-4000-8000-00000000e081' order by period_start $$,
  $$ values (date '2026-10-01', date '2026-10-07', date '2026-10-11', date '2026-10-11', 'draft', 677419::bigint) $$,
  'a termination today bills 01/10 to 07/10, 7 of 31 days');
select results_eq(
  $$ select period_start, period_end, due_date, issue_on, status, amount_vnd from billed where lease_id = '00000000-0000-4000-8000-00000000e091' order by period_start $$,
  $$ values (date '2026-10-04', date '2026-10-05', date '2026-10-14', date '2026-10-14', 'draft', 193548::bigint) $$,
  'a lease paid through 03/10 bills only 04/10 and 05/10, 2 of 31 days');

select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-10-10', '2026-10-10T00:30:00+07:00') $$, :'a'),
  $$ values (0, 0) $$,
  'the nightly run on 10/10 drafts nothing again and issues nothing early');
select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-10-11', '2026-10-11T00:30:00+07:00') $$, :'a'),
  $$ values (0, 2) $$,
  'the run on 11/10 issues Phòng 5 and Phòng 8 on their issue date');
select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-10-14', '2026-10-14T00:30:00+07:00') $$, :'a'),
  $$ values (0, 1) $$,
  'the run on 14/10 issues Phòng 9');
select tests.clear_request();
reset role;
select results_eq(
  format($$ select lease_id, period_start, period_end, status from billed where household_id = %L order by lease_id $$, :'a'),
  $$ values ('00000000-0000-4000-8000-00000000e051'::uuid, date '2026-10-01', date '2026-10-05', 'issued'),
            ('00000000-0000-4000-8000-00000000e061'::uuid, date '2026-10-01', date '2026-10-05', 'issued'),
            ('00000000-0000-4000-8000-00000000e081'::uuid, date '2026-10-01', date '2026-10-07', 'issued'),
            ('00000000-0000-4000-8000-00000000e091'::uuid, date '2026-10-04', date '2026-10-05', 'issued') $$,
  'each lease ends with exactly one invoice covering every unpaid day up to its termination date');

select * from finish();
rollback;
