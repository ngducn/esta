begin;
\ir _harness.psql

select plan(60);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

-- Household a holds SPEC §9.3 shapes on the database clock's 2026-10-07: Dĩ An rooms billed from the 25th with their
-- October invoices issued on 03/10, Phòng 7 ended, Thủ Đức ending 01/11 with its one-day draft, and a calendar-month
-- room whose November draft falls inside the 35-day horizon.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Căn hộ Thủ Đức', 'THUDUC', 'apartment', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room'),
  ('00000000-0000-4000-8000-000000000a13', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room'),
  ('00000000-0000-4000-8000-000000000a14', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 4', 'room'),
  ('00000000-0000-4000-8000-000000000a17', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 7', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Trần Thị Bình Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, paid_through_date, deposit_vnd, status
) values
  ('00000000-0000-4000-8000-00000000e021', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
   '00000000-0000-4000-8000-00000000a0a1', '2025-06-25', '2027-06-24', 2500000, 1, 'lease_start', 'metered_by_owner', '2026-09-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e031', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13',
   '00000000-0000-4000-8000-00000000a0a1', '2025-09-25', '2027-06-24', 2500000, 1, 'lease_start', 'metered_by_owner', '2026-10-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e041', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a14',
   '00000000-0000-4000-8000-00000000a0a1', '2026-08-01', null, 3000000, 1, 'calendar_month', 'tenant_direct', '2026-09-30', 3000000, 'active'),
  ('00000000-0000-4000-8000-00000000e071', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a17',
   '00000000-0000-4000-8000-00000000a0a1', '2025-09-16', '2026-09-15', 2800000, 1, 'lease_start', 'metered_by_owner', '2026-09-15', 2800000, 'ended'),
  ('00000000-0000-4000-8000-00000000e0d1', :'a', '00000000-0000-4000-8000-0000000000a2', private.whole_unit_id('00000000-0000-4000-8000-0000000000a2'),
   '00000000-0000-4000-8000-00000000a0a1', '2025-11-01', '2026-11-01', 9000000, 1, 'calendar_month', 'tenant_direct', '2026-09-30', 18000000, 'active');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0021', :'a', '00000000-0000-4000-8000-00000000e021', '2026-09-25', '2026-10-24', '2026-09-25', '2026-09-25', 'issued', '2026-09-25T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0022', :'a', '00000000-0000-4000-8000-00000000e021', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0031', :'a', '00000000-0000-4000-8000-00000000e031', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0041', :'a', '00000000-0000-4000-8000-00000000e041', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'issued', '2026-10-01T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0042', :'a', '00000000-0000-4000-8000-00000000e041', '2026-11-01', '2026-11-30', '2026-11-01', '2026-11-01', 'draft', null),
  ('00000000-0000-4000-8000-0000000f00d1', :'a', '00000000-0000-4000-8000-00000000e0d1', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'issued', '2026-10-01T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f00d2', :'a', '00000000-0000-4000-8000-00000000e0d1', '2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01', 'draft', null);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000f0021', 'rent', 2500000, 2500000),
  (:'a', '00000000-0000-4000-8000-0000000f0022', 'rent', 2500000, 2500000),
  (:'a', '00000000-0000-4000-8000-0000000f0031', 'rent', 2500000, 2500000),
  (:'a', '00000000-0000-4000-8000-0000000f0041', 'rent', 3000000, 3000000),
  (:'a', '00000000-0000-4000-8000-0000000f0042', 'rent', 3000000, 3000000),
  (:'a', '00000000-0000-4000-8000-0000000f00d1', 'rent', 9000000, 9000000),
  (:'a', '00000000-0000-4000-8000-0000000f00d2', 'rent', 290323, 290323);

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

-- Every issued invoice of household a with its lines, to prove nothing below changes one (LSE-2).
create temporary view issued_snapshot as
  select i.id, to_jsonb(i) as invoice, (select jsonb_agg(to_jsonb(l) order by l.id) from public.invoice_lines l where l.invoice_id = i.id) as lines
  from public.invoices i where i.status = 'issued';
select jsonb_agg(jsonb_build_array(invoice, lines) order by id)::text as issued_before from issued_snapshot \gset

select ok(not has_column_privilege('authenticated', 'public.leases', 'status', 'UPDATE'), '#144: a member cannot write a lease''s status');
select ok(not has_column_privilege('authenticated', 'public.leases', 'paid_through_date', 'UPDATE'), 'nor its paid-through date');
select ok(not has_column_privilege('authenticated', 'public.leases', 'terminated_on', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.leases', 'termination_reason', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.leases', 'renewal_of_lease_id', 'UPDATE'), 'nor its termination or renewal link');
select ok(has_column_privilege('authenticated', 'public.leases', 'end_date', 'UPDATE'), 'a draft''s end date stays editable; guard_lease freezes it once active');
select ok(has_function_privilege('authenticated', 'public.amend_lease(uuid, date, bigint, integer, text)', 'execute')
  and has_function_privilege('authenticated', 'public.terminate_lease(uuid, date, text)', 'execute')
  and has_function_privilege('authenticated', 'public.renew_lease(uuid, integer, date, date)', 'execute'), 'a member calls amend, terminate and renew');
select ok(not has_function_privilege('anon', 'public.amend_lease(uuid, date, bigint, integer, text)', 'execute')
  and not has_function_privilege('anon', 'public.terminate_lease(uuid, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.renew_lease(uuid, integer, date, date)', 'execute'), 'anon calls none of them');
select ok(not has_function_privilege('authenticated', 'private.lease_periods(public.leases, date)', 'execute')
  and not has_function_privilege('authenticated', 'private.member_lease(uuid)', 'execute'), 'the private helpers stay private');
select ok(not has_table_privilege('authenticated', 'public.lease_amendments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lease_amendments', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.lease_amendments', 'DELETE'), 'a member writes amendments only through amend_lease');

select tests.act_as('member.a@test.esta.test');

select throws_ok(
  $$ update public.leases set status = 'ended' where id = '00000000-0000-4000-8000-00000000e021' $$,
  '42501', 'permission denied for table leases', '#144: a member''s direct status write is refused');
select throws_ok(
  $$ update public.leases set end_date = '2026-10-31' where id = '00000000-0000-4000-8000-00000000e021' $$,
  '23514', 'ESTA_LEASE_TERMS_LOCKED', '#144: a member''s direct end date write on an active lease is refused');
select throws_ok(
  $$ update public.leases set paid_through_date = '2026-12-24' where id = '00000000-0000-4000-8000-00000000e021' $$,
  '42501', 'permission denied for table leases', 'a direct paid-through write is refused');
select throws_ok(
  format($$ insert into public.lease_amendments (household_id, lease_id, effective_period_start, changes)
            values (%L, '00000000-0000-4000-8000-00000000e021', '2026-11-25', '{"rent_vnd": 1}') $$, :'a'),
  '42501', null, 'a direct amendment insert is refused');
select lives_ok(
  $$ update public.leases set notes = 'Khách quen' where id = '00000000-0000-4000-8000-00000000e021' $$,
  'notes stay writable on an active lease');

-- Amend (LSE-2, LSE-3).
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e021', '2026-10-25', 2700000) $$,
  '22023', 'ESTA_AMENDMENT_ALREADY_BILLED', 'the 25/10 period is issued, so it keeps its rent');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e021', '2026-09-25', 2700000) $$,
  '22023', 'ESTA_AMENDMENT_NOT_AFTER_AS_OF', 'a start on or before the database clock''s date is refused');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e021', '2026-12-01', 2700000) $$,
  '22023', 'ESTA_AMENDMENT_NOT_A_PERIOD_START', '01/12 starts no period of a lease billed from the 25th');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e021', '2027-07-25', 2700000) $$,
  '22023', 'ESTA_AMENDMENT_NOT_A_PERIOD_START', 'a start after the end date is refused');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e021', '2026-11-25') $$,
  '22023', 'ESTA_AMENDMENT_EMPTY', 'an amendment changes something');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e071', '2026-11-25', 2700000) $$,
  '55000', 'ESTA_LEASE_NOT_ACTIVE', 'an ended lease is not amended');
select is_empty($$ select 1 from public.lease_amendments $$, 'no refused amendment is left behind');

select isnt(public.amend_lease('00000000-0000-4000-8000-00000000e021', '2026-11-25', 2700000, null, 'Phụ lục Demo'), null,
  'Phòng 2 takes 2.700.000 ₫ from 25/11/2026');
select results_eq(
  $$ select effective_period_start, changes, reason from public.lease_amendments where lease_id = '00000000-0000-4000-8000-00000000e021' $$,
  $$ values (date '2026-11-25', '{"rent_vnd": 2700000}'::jsonb, 'Phụ lục Demo') $$,
  'the amendment records the start, the change and the reason');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e021', '2026-11-25', 2800000) $$,
  '23505', 'ESTA_AMENDMENT_DUPLICATE', 'a second amendment from the same start is refused (duplicate_effective_start)');
select lives_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e041', '2026-11-01', 3300000) $$,
  'Phòng 4 takes 3.300.000 ₫ from 01/11/2026, inside the horizon');
select results_eq(
  $$ select i.period_start, i.period_end, i.status, l.amount_vnd from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000e041' order by i.period_start $$,
  $$ values (date '2026-10-01', date '2026-10-31', 'issued', 3000000::bigint), (date '2026-11-01', date '2026-11-30', 'draft', 3300000::bigint) $$,
  'the November draft is planned again at the new rent and October stays issued at the old one');
select isnt(
  (select id from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e041' and period_start = '2026-11-01'),
  '00000000-0000-4000-8000-0000000f0042'::uuid, 'the old November draft is gone');
select lives_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e041', '2027-01-01', null, 3) $$,
  'Phòng 4 moves to quarterly billing from 01/01/2027');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e041', '2026-12-01', 3200000, 6) $$,
  '22023', 'ESTA_AMENDMENT_MOVES_LATER', 'a six-month cycle from 01/12 would strand the 01/01 change');

-- Terminate (LSE-2, #144).
select throws_ok(
  $$ select public.terminate_lease('00000000-0000-4000-8000-00000000e071', '2026-09-15', 'Đã trả phòng') $$,
  '55000', 'ESTA_LEASE_NOT_ACTIVE', 'an ended lease cannot be terminated');
select throws_ok(
  $$ select public.terminate_lease('00000000-0000-4000-8000-00000000e031', '2026-10-20', 'Chuyển đi') $$,
  '22023', 'ESTA_TERMINATION_BEFORE_ISSUED', 'a date before an issued period is refused, because that invoice cannot change');
select throws_ok(
  $$ select public.terminate_lease('00000000-0000-4000-8000-00000000e031', '2026-10-31', '  ') $$,
  '22023', 'ESTA_TERMINATION_REASON', 'a termination needs a reason');
select throws_ok(
  $$ select public.terminate_lease('00000000-0000-4000-8000-00000000e031', '2027-07-01', 'Chuyển đi') $$,
  '22023', 'ESTA_TERMINATION_DATE', 'a date after the end date is refused');
select lives_ok(
  $$ select public.terminate_lease('00000000-0000-4000-8000-00000000e031', '2026-10-31', 'Người thuê chuyển đi') $$,
  'Phòng 3 ends on 31/10/2026');
select results_eq(
  $$ select status, terminated_on, end_date, termination_reason from public.leases where id = '00000000-0000-4000-8000-00000000e031' $$,
  $$ values ('terminated', date '2026-10-31', date '2026-10-31', 'Người thuê chuyển đi') $$,
  'Phòng 3 is terminated and now ends on its termination date');
select lives_ok(
  $$ select public.terminate_lease('00000000-0000-4000-8000-00000000e041', '2026-11-15', 'Trả phòng giữa tháng') $$,
  'Phòng 4 ends on 15/11/2026');
select results_eq(
  $$ select i.period_start, i.period_end, i.status, l.amount_vnd from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000e041' order by i.period_start $$,
  $$ values (date '2026-10-01', date '2026-10-31', 'issued', 3000000::bigint), (date '2026-11-01', date '2026-11-15', 'draft', 1650000::bigint) $$,
  'the November draft stops on 15/11 at 15 of 30 days of the amended rent');
select throws_ok(
  $$ select public.terminate_lease('00000000-0000-4000-8000-00000000e031', '2026-10-31', 'Lần hai') $$,
  '55000', 'ESTA_LEASE_NOT_ACTIVE', 'a terminated lease is final');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e041', '2027-04-01', 3500000) $$,
  '55000', 'ESTA_LEASE_NOT_ACTIVE', 'a terminated lease takes no amendment');

-- Renew (LSE-2, SPEC §9.4 seed 7).
select throws_ok(
  $$ select public.renew_lease('00000000-0000-4000-8000-00000000e031', 500) $$,
  '55000', 'ESTA_LEASE_NOT_RENEWABLE', 'a terminated lease is not renewed');
select throws_ok(
  $$ select public.renew_lease('00000000-0000-4000-8000-00000000e0d1', 20000) $$,
  '22023', 'ESTA_RENEWAL_INCREASE', 'an increase above 100% is refused');
select throws_ok(
  $$ select public.renew_lease('00000000-0000-4000-8000-00000000e0d1', 500, '2026-11-01') $$,
  '22023', 'ESTA_RENEWAL_END', 'the new end date must come after the new start');
select public.renew_lease('00000000-0000-4000-8000-00000000e0d1', 500, '2027-11-01') as renewal \gset
select results_eq(
  format($$ select start_date, end_date, rent_vnd, renewal_of_lease_id, status, tenant_party_id, deposit_vnd, billing_cycle_months
            from public.leases where id = %L $$, :'renewal'),
  $$ values (date '2026-11-02', date '2027-11-01', 9500000::bigint, '00000000-0000-4000-8000-00000000e0d1'::uuid, 'active',
             '00000000-0000-4000-8000-00000000a0a1'::uuid, 18000000::bigint, 1::smallint) $$,
  'seed 7: the renewal starts 02/11/2026 at 9.000.000 ₫ × 1,05 rounded half up to 9.500.000 ₫, linked to Thủ Đức''s lease');
select results_eq(
  format($$ select i.period_start, i.period_end, i.status, l.amount_vnd from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
            where i.lease_id = %L $$, :'renewal'),
  $$ values (date '2026-11-02', date '2026-11-30', 'draft', 9183333::bigint) $$,
  'the renewal drafts its first period, 29 of 30 days of November');
select throws_ok(
  $$ select public.renew_lease('00000000-0000-4000-8000-00000000e0d1', 500) $$,
  '55000', 'ESTA_LEASE_ALREADY_RENEWED', 'a lease is renewed once');
select results_eq(
  $$ select status, end_date from public.leases where id = '00000000-0000-4000-8000-00000000e0d1' $$,
  $$ values ('active', date '2026-11-01') $$,
  'the old lease runs to its own end');

select tests.clear_request();
reset role;
select is((select jsonb_agg(jsonb_build_array(invoice, lines) order by id)::text from issued_snapshot), :'issued_before',
  'LSE-2: every issued invoice and its lines are byte-identical after the amendments, terminations and renewal');

-- The nightly job on 02/11/2026 never bills Phòng 3 after its termination and bills Phòng 2's amended rent when it comes.
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select public.end_expired_leases('2026-11-02') as ended \gset
select lives_ok(
  format($$ select * from public.run_invoicing(%L, '2026-11-02', '2026-11-02T09:00:00+07:00') $$, :'a'),
  'the nightly run on 02/11/2026 succeeds');
select is_empty(
  $$ select 1 from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e031' and period_start > '2026-10-31' $$,
  '#144: no invoice of Phòng 3 starts after 31/10/2026');
select results_eq(
  $$ select i.period_start, i.status, l.amount_vnd from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000e041' and i.period_start = '2026-11-01' $$,
  $$ values (date '2026-11-01', 'issued', 1650000::bigint) $$,
  'Phòng 4''s last stretch issues on its start, before its termination date');
select results_eq(
  $$ select i.period_start, i.status, l.amount_vnd from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000e021' and i.period_start = '2026-11-25' $$,
  $$ values (date '2026-11-25', 'draft', 2700000::bigint) $$,
  'Phòng 2''s 25/11 period drafts at the amended 2.700.000 ₫');
select results_eq(
  $$ select status from public.leases where id = '00000000-0000-4000-8000-00000000e0d1' $$,
  $$ values ('ended') $$,
  'Thủ Đức''s old lease ends after 01/11 and its renewal carries on');

-- The unique index refuses a second amendment for one start even outside amend_lease.
select tests.clear_request();
reset role;
select throws_ok(
  format($$ insert into public.lease_amendments (household_id, lease_id, effective_period_start, changes)
            values (%L, '00000000-0000-4000-8000-00000000e021', '2026-11-25', '{"rent_vnd": 2900000}') $$, :'a'),
  '23505', 'duplicate key value violates unique constraint "lease_amendments_duplicate_effective_start"',
  'lease_amendments is unique on (lease_id, effective_period_start)');
select throws_ok(
  format($$ insert into public.lease_amendments (household_id, lease_id, effective_period_start, changes)
            values (%L, '00000000-0000-4000-8000-00000000e021', '2027-01-25', '{"rent_vnd": 2.5}') $$, :'a'),
  '23514', null, 'an amendment rent is whole đồng');
select throws_ok(
  $$ update public.leases set status = 'terminated', terminated_on = '2026-12-01' where id = '00000000-0000-4000-8000-00000000e021' $$,
  '23514', null, 'a terminated lease always ends on its termination date');
select results_eq(
  $$ select s.period_start, s.cycle_months, s.monthly_rent_vnd from private.lease_periods(
       (select l from public.leases l where l.id = '00000000-0000-4000-8000-00000000e021'), '2027-01-25') s
     where s.period_start >= '2026-10-25' $$,
  $$ values (date '2026-10-25', 1, 2500000::bigint), (date '2026-11-25', 1, 2700000::bigint), (date '2026-12-25', 1, 2700000::bigint),
            (date '2027-01-25', 1, 2700000::bigint) $$,
  'lease_periods bills the amended rent from its start on');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.lease_amendments', :'a', true);
select throws_ok(
  $$ select public.terminate_lease('00000000-0000-4000-8000-00000000e021', '2026-12-24', 'Thử') $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'a viewer cannot terminate');
select throws_ok(
  $$ select public.amend_lease('00000000-0000-4000-8000-00000000e021', '2026-12-25', 2800000) $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'a viewer cannot amend');

select tests.act_as('member.b@test.esta.test');
select tests.sees_household('public.lease_amendments', :'a', false);
select throws_ok(
  $$ select public.renew_lease('00000000-0000-4000-8000-00000000e021', 500) $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'another household cannot renew the lease');

select * from finish();
rollback;
