begin;
\ir _harness.psql

select plan(13);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a5', :'a', 'individual', 'Trần Thị Mai Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B Demo', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, deposit_vnd, status) values
  ('00000000-0000-4000-8000-00000000e005', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a15',
   '00000000-0000-4000-8000-00000000a0a5', '2026-01-01', null, 3000000, 3000000, 'active'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1',
   private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 9000000, 'active');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0509', :'a', '00000000-0000-4000-8000-00000000e005', '2026-09-01', '2026-09-30', '2026-09-01', '2026-09-01', 'DIAN-202609-005', 'issued', '2026-09-01T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0510', :'a', '00000000-0000-4000-8000-00000000e005', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'DIAN-202610-005', 'issued', '2026-10-01T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0b10', :'b', '00000000-0000-4000-8000-00000000e0b1', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'B1-202610-001', 'issued', '2026-10-01T00:30:00+07:00');
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000f0509', 'rent', 3000000, 3000000),
  (:'a', '00000000-0000-4000-8000-0000000f0510', 'rent', 3000000, 3000000),
  (:'b', '00000000-0000-4000-8000-0000000f0b10', 'rent', 9000000, 9000000);
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c0501', :'a', '00000000-0000-4000-8000-00000000a0a5', 2000000, '2026-09-05', 'bank_transfer'),
  ('00000000-0000-4000-8000-0000000c0502', :'a', '00000000-0000-4000-8000-00000000a0a5', 1000000, '2026-10-02', 'cash'),
  ('00000000-0000-4000-8000-0000000c0b01', :'b', '00000000-0000-4000-8000-00000000b0b1', 9000000, '2026-10-03', 'bank_transfer');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000c0501', '00000000-0000-4000-8000-0000000f0509', 2000000),
  (:'a', '00000000-0000-4000-8000-0000000c0502', '00000000-0000-4000-8000-0000000f0509', 1000000),
  (:'b', '00000000-0000-4000-8000-0000000c0b01', '00000000-0000-4000-8000-0000000f0b10', 9000000);

\set ledger 'select received_on, method, amount_vnd from public.allocation_facts where property_id = ''00000000-0000-4000-8000-0000000000a1'' order by received_on, amount_vnd'

select tests.act_as('viewer.a@test.esta.test');
select results_eq(
  :'ledger',
  $$ values ('2026-09-05'::date, 'bank_transfer'::text, 2000000::bigint), ('2026-10-02', 'cash', 1000000) $$,
  'a viewer reads each allocation on the day its payment was received, whatever month the bill is for (FIN-2)');
select results_eq(
  $$ select distinct household_id, property_id, unit_id, lease_id from public.allocation_facts $$,
  format($$ values (%L::uuid, '00000000-0000-4000-8000-0000000000a1'::uuid, '00000000-0000-4000-8000-000000000a15'::uuid, '00000000-0000-4000-8000-00000000e005'::uuid) $$, :'a'),
  'each fact carries the bill''s property, unit and lease, and only the viewer''s household (FND-2)');

select tests.act_as('viewer.b@test.esta.test');
select results_eq(
  $$ select household_id, amount_vnd from public.allocation_facts $$,
  format($$ values (%L::uuid, 9000000::bigint) $$, :'b'),
  'b reads its own allocation and nothing of a');

select tests.act_as('member.a@test.esta.test');
select results_eq(
  $$ select allocated_vnd from public.record_payment('00000000-0000-4000-8000-0000000f0510', 3000000, 3500000, 'bank_transfer', '2026-10-06', '00000000-0000-4000-8000-0000000d0001') $$,
  $$ values (3000000::bigint) $$,
  'an overpayment allocates what the bill owes');
select results_eq(
  $$ select sum(amount_vnd)::bigint from public.allocation_facts where received_on = '2026-10-06' $$,
  $$ values (3000000::bigint) $$,
  'money kept as credit is not income until it is allocated');

select lives_ok(
  $$ select public.undo_payment(p.id) from public.payments p where p.received_on = '2026-10-06' $$,
  'Hoàn tác removes the payment');
select is_empty(
  $$ select 1 from public.allocation_facts where received_on = '2026-10-06' $$,
  'an undone payment is not income');

select throws_ok(
  $$ select public.void_invoice('00000000-0000-4000-8000-0000000f0509', 'Nhập nhầm') $$,
  '23514', 'ESTA_INVOICE_HAS_PAYMENTS', 'a bill with payments cannot be voided');

select lives_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e005', 'received', 3000000, '2026-01-01', '00000000-0000-4000-8000-0000000d0002') $$,
  'a deposit is received');
select is_empty(
  $$ select 1 from public.allocation_facts where received_on = '2026-01-01' $$,
  'a deposit received is not income');
select lives_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-0000000f0510', 1200000, '2026-10-07', '00000000-0000-4000-8000-0000000d0003') $$,
  'part of the deposit settles October''s bill');
select results_eq(
  $$ select received_on, method, amount_vnd from public.allocation_facts where method = 'deposit' $$,
  $$ values ('2026-10-07'::date, 'deposit'::text, 1200000::bigint) $$,
  'a deposit applied to a bill is income on the day it was applied (SPEC §5.4)');

reset role;
set local session_replication_role = replica;
update public.invoices set status = 'void', voided_reason = 'test', share_token = null where id = '00000000-0000-4000-8000-0000000f0509';
set local session_replication_role = origin;
select tests.act_as('viewer.a@test.esta.test');
select is_empty(
  $$ select 1 from public.allocation_facts where invoice_id = '00000000-0000-4000-8000-0000000f0509' $$,
  'a void bill brings no income');

select * from finish();
rollback;
