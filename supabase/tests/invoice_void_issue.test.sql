begin;
\ir _harness.psql

select plan(30);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

-- Dĩ An on the database clock's 2026-10-20, billed by calendar month on the 1st at 3.000.000 ₫. Phòng 5 holds its
-- issued October bill and November's draft. Phòng 6's September bill is paid and its October bill was issued by
-- mistake: the tenant left on 30/09. Household b keeps its own receiving account.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room'),
  ('00000000-0000-4000-8000-000000000a16', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 6', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Trần Thị Bình Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, deposit_vnd, status
)
select ('00000000-0000-4000-8000-00000000e0' || k || '1')::uuid, :'a', '00000000-0000-4000-8000-0000000000a1',
  ('00000000-0000-4000-8000-000000000a1' || k)::uuid, '00000000-0000-4000-8000-00000000a0a1', '2026-09-01', '2027-08-31', 3000000, 1,
  'calendar_month', 'tenant_direct', 0, 3000000, 'active'
from (values ('5'), ('6')) as room (k);
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at)
select ('00000000-0000-4000-8000-0000000f00' || k || m)::uuid, :'a', ('00000000-0000-4000-8000-00000000e0' || k || '1')::uuid,
  period_start, (period_start + interval '1 month' - interval '1 day')::date, period_start, period_start, status,
  case when status = 'issued' then period_start::timestamptz end
from (values
  ('5', '1', date '2026-09-01', 'issued'),
  ('5', '2', date '2026-10-01', 'issued'),
  ('5', '3', date '2026-11-01', 'draft'),
  ('6', '1', date '2026-09-01', 'issued'),
  ('6', '2', date '2026-10-01', 'issued'),
  ('6', '3', date '2026-11-01', 'draft')
) as bill (k, m, period_start, status);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select :'a', id, 'rent', 3000000, 3000000 from public.invoices where household_id = :'a';
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c0001', :'a', '00000000-0000-4000-8000-00000000a0a1', 3000000, '2026-09-02', 'cash');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000f0061', 3000000);
insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, is_default) values
  ('00000000-0000-4000-8000-00000000aa01', :'a', '970436', '0123456789', 'NGUYEN THI DEMO', true),
  ('00000000-0000-4000-8000-00000000bb01', :'b', '970436', '0123456789', 'TRAN VAN DEMO', true);

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-20T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

-- Voiding (LSE-5).
select tests.act_as('member.b@test.esta.test');
select throws_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0062', 'Nhầm') $$,
  'P0002', 'ESTA_INVOICE_NOT_FOUND', 'a member of another household cannot void the bill');
select tests.act_as('viewer.a@test.esta.test');
select throws_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0062', 'Nhầm') $$,
  'P0002', 'ESTA_INVOICE_NOT_FOUND', 'a viewer cannot void the bill');
select throws_ok($$ select public.issue_invoice_now('00000000-0000-4000-8000-0000000f0053') $$,
  'P0002', 'ESTA_INVOICE_NOT_FOUND', 'a viewer cannot issue a draft');

select tests.act_as('member.a@test.esta.test');
select throws_ok($$ update public.invoices set status = 'void', voided_reason = 'Nhầm' where id = '00000000-0000-4000-8000-0000000f0062' $$,
  '42501', null, 'a member never writes an invoice directly');
select throws_ok($$ select public.terminate_lease('00000000-0000-4000-8000-00000000e061', '2026-09-30', 'Người thuê Demo chuyển đi') $$,
  '22023', 'ESTA_TERMINATION_BEFORE_ISSUED', 'the issued October bill blocks ending Phòng 6 on 30/09');
select throws_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0062', '  ') $$,
  '22023', 'ESTA_VOID_REASON', 'a void needs a reason');
select throws_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0063', 'Nhầm') $$,
  '55000', 'ESTA_INVOICE_NOT_ISSUED', 'a draft is not voided; it is never sent');
select throws_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0061', 'Nhầm') $$,
  '23514', 'ESTA_INVOICE_HAS_PAYMENTS', '[app rule] a bill a payment settled cannot be voided');
select lives_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0062', '  Người thuê Demo đã chuyển đi 30/09  ') $$,
  'a member voids the wrong October bill with a reason');
select throws_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0062', 'Lần nữa') $$,
  '55000', 'ESTA_INVOICE_NOT_ISSUED', 'a void bill is not voided twice');
select results_eq(
  $$ select status, voided_reason, issued_at, number from public.invoices where id = '00000000-0000-4000-8000-0000000f0062' $$,
  $$ select 'void', 'Người thuê Demo đã chuyển đi 30/09', issued_at, number from public.invoices where id = '00000000-0000-4000-8000-0000000f0062' $$,
  'the bill keeps its number and issue time, with the reason trimmed');
select is((select status from public.invoices where id = '00000000-0000-4000-8000-0000000f0062'), 'void', 'the bill reads void');
select results_eq(
  $$ select invoice_id, invoice_status from public.lease_schedule(array['00000000-0000-4000-8000-00000000e061'::uuid], '2026-10-31') order by period_start $$,
  $$ values ('00000000-0000-4000-8000-0000000f0061'::uuid, 'issued'), ('00000000-0000-4000-8000-0000000f0062'::uuid, 'void') $$,
  'the lease schedule names the void bill for October, so the timeline reads it as voided');
select throws_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0062', 3000000, 3000000, 'cash', '2026-10-20', '00000000-0000-4000-8000-00000000c101') $$,
  'P0002', 'ESTA_INVOICE_NOT_FOUND', 'a void bill takes no payment');
select tests.clear_request();
reset role;
select throws_ok($$ insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
  select household_id, '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000f0062', 1 from public.invoices where id = '00000000-0000-4000-8000-0000000f0062' $$,
  '23514', 'ESTA_ALLOCATION_INVOICE_NOT_ISSUED', 'no path allocates money to a void bill');
select throws_ok($$ update public.invoices set status = 'issued', voided_reason = null where id = '00000000-0000-4000-8000-0000000f0062' $$,
  '23514', 'ESTA_INVOICE_ISSUED', 'a void bill never comes back');
select throws_ok($$ update public.invoices set status = 'void', voided_reason = 'x', due_date = '2026-10-05' where id = '00000000-0000-4000-8000-0000000f0052' $$,
  '23514', 'ESTA_INVOICE_ISSUED', 'a void changes nothing but the status and the reason');

select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-10-21', '2026-10-21T00:30:00+07:00') $$, :'a'),
  $$ values (0, 0) $$,
  'the nightly run drafts nothing for the voided October');
select tests.clear_request();
reset role;
select is((select count(*)::integer from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e061' and period_start = '2026-10-01'), 1,
  'October keeps its one, void, bill');

select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select public.terminate_lease('00000000-0000-4000-8000-00000000e061', '2026-09-30', 'Người thuê Demo chuyển đi') $$,
  'with October voided, Phòng 6 ends on 30/09');
select tests.clear_request();
reset role;
select results_eq(
  $$ select period_start, status from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e061' order by period_start $$,
  $$ values (date '2026-09-01', 'issued'), (date '2026-10-01', 'void') $$,
  'the November draft goes with the termination; September and the void October stay');

-- Issuing a draft early.
select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select public.issue_invoice_now('00000000-0000-4000-8000-0000000f0053') $$, 'a member issues November on 20/10');
select results_eq(
  $$ select status, issue_on, issued_at, due_date from public.invoices where id = '00000000-0000-4000-8000-0000000f0053' $$,
  $$ values ('issued', date '2026-10-20', timestamptz '2026-10-20T09:00:00+07:00', date '2026-11-01') $$,
  'it issues on the database clock''s date and instant and keeps its due date');
select throws_ok($$ select public.issue_invoice_now('00000000-0000-4000-8000-0000000f0053') $$,
  '55000', 'ESTA_INVOICE_NOT_DRAFT', 'a bill is issued once');
select throws_ok($$ select public.issue_invoice_now('00000000-0000-4000-8000-0000000f0062') $$,
  '55000', 'ESTA_INVOICE_NOT_DRAFT', 'a void bill does not issue');

-- The receiving account a transfer landed in (PLT-1).
select throws_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0052', 3000000, 3000000, 'cash', '2026-10-20', '00000000-0000-4000-8000-00000000c102', null, '00000000-0000-4000-8000-00000000aa01') $$,
  '22023', 'ESTA_PAYMENT_ACCOUNT', 'cash names no receiving account');
select throws_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0052', 3000000, 3000000, 'bank_transfer', '2026-10-20', '00000000-0000-4000-8000-00000000c103', null, '00000000-0000-4000-8000-00000000bb01') $$,
  '22023', 'ESTA_PAYMENT_ACCOUNT', 'a transfer cannot land in another household''s account');
select results_eq(
  $$ select amount_vnd, allocated_vnd from public.record_payment('00000000-0000-4000-8000-0000000f0052', 6000000, 3000000, 'bank_transfer', '2026-10-20', '00000000-0000-4000-8000-00000000c104', null, '00000000-0000-4000-8000-00000000aa01') $$,
  $$ values (3000000::bigint, 3000000::bigint) $$,
  'a transfer records the default account it went to');
select is((select bank_account_id from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000c104'), '00000000-0000-4000-8000-00000000aa01'::uuid,
  'the payment names the account');
select tests.clear_request();
reset role;
update public.bank_accounts set is_default = false where id = '00000000-0000-4000-8000-00000000aa01';
select throws_ok($$ delete from public.bank_accounts where id = '00000000-0000-4000-8000-00000000aa01' $$,
  '23503', null, 'the account a payment landed in cannot be removed, so the payment keeps where it landed');

select * from finish();
rollback;
