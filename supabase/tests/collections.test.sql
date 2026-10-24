begin;
\ir _harness.psql

select plan(34);

select tests.create_household('a') as a, tests.create_household('b') as b, tests.create_household('c') as c \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a5', :'a', 'individual', 'Hoàng Văn Em Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e005', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a15',
   '00000000-0000-4000-8000-00000000a0a5', '2026-02-25', '2027-06-24', 2800000, 'active'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1',
   private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 'active');

-- One invoice per case, named by its number's sequence: 001 paid in August, 002 partly paid in August, 003 unpaid in
-- September, 004 paid in two transfers on 1 October, 005 unpaid due 25 October, 006 a draft, 007 voided, 008 due in
-- November; household b's 001 is due in October.
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, status, issued_at, voided_reason) values
  ('00000000-0000-4000-8000-0000000f0001', :'a', '00000000-0000-4000-8000-00000000e005', '2026-07-25', '2026-08-24', '2026-07-25', '2026-07-25', 'DIAN-202607-001', 'issued', '2026-07-25T00:30:00+07:00', null),
  ('00000000-0000-4000-8000-0000000f0002', :'a', '00000000-0000-4000-8000-00000000e005', '2026-08-25', '2026-09-24', '2026-08-25', '2026-08-25', 'DIAN-202608-002', 'issued', '2026-08-25T00:30:00+07:00', null),
  ('00000000-0000-4000-8000-0000000f0003', :'a', '00000000-0000-4000-8000-00000000e005', '2026-09-25', '2026-10-24', '2026-09-25', '2026-09-25', 'DIAN-202609-003', 'issued', '2026-09-25T00:30:00+07:00', null),
  ('00000000-0000-4000-8000-0000000f0004', :'a', '00000000-0000-4000-8000-00000000e005', '2026-01-01', '2026-01-31', '2026-10-01', '2026-10-01', 'DIAN-202601-004', 'issued', '2026-10-01T00:30:00+07:00', null),
  ('00000000-0000-4000-8000-0000000f0005', :'a', '00000000-0000-4000-8000-00000000e005', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-005', 'issued', '2026-10-03T00:30:00+07:00', null),
  ('00000000-0000-4000-8000-0000000f0006', :'a', '00000000-0000-4000-8000-00000000e005', '2026-02-01', '2026-02-28', '2026-10-10', '2026-10-10', 'DIAN-202602-006', 'draft', null, null),
  ('00000000-0000-4000-8000-0000000f0007', :'a', '00000000-0000-4000-8000-00000000e005', '2026-03-01', '2026-03-31', '2026-10-12', '2026-10-12', 'DIAN-202603-007', 'void', '2026-10-01T00:30:00+07:00', 'Nhập nhầm'),
  ('00000000-0000-4000-8000-0000000f0008', :'a', '00000000-0000-4000-8000-00000000e005', '2026-11-25', '2026-12-24', '2026-11-25', '2026-11-25', 'DIAN-202611-008', 'issued', '2026-10-06T00:30:00+07:00', null),
  ('00000000-0000-4000-8000-0000000f00b1', :'b', '00000000-0000-4000-8000-00000000e0b1', '2026-10-01', '2026-10-31', '2026-10-05', '2026-10-01', 'B1-202610-001', 'issued', '2026-10-01T00:30:00+07:00', null);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select household_id, id, 'rent', 2800000, 2800000 from public.invoices;

-- Household c archived its only property while 001 (due in September) was still unpaid and 002 (due in October) was paid.
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000c1', :'c', 'Nhà đã bán', 'SOLD', 'townhouse', 'rental');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000c0c1', :'c', 'individual', 'Người thuê C Demo', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e0c1', :'c', '00000000-0000-4000-8000-0000000000c1',
   private.whole_unit_id('00000000-0000-4000-8000-0000000000c1'), '00000000-0000-4000-8000-00000000c0c1', '2026-01-01', null, 9000000, 'active');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f00c1', :'c', '00000000-0000-4000-8000-00000000e0c1', '2026-09-01', '2026-09-30', '2026-09-05', '2026-09-01', 'SOLD-202609-001', 'issued', '2026-09-01T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f00c2', :'c', '00000000-0000-4000-8000-00000000e0c1', '2026-10-01', '2026-10-31', '2026-10-05', '2026-10-01', 'SOLD-202610-002', 'issued', '2026-10-01T00:30:00+07:00');
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select household_id, id, 'rent', 9000000, 9000000 from public.invoices where household_id = :'c';
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c00c2', :'c', '00000000-0000-4000-8000-00000000c0c1', 9000000, '2026-10-05', 'bank_transfer');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values
  (:'c', '00000000-0000-4000-8000-0000000c00c2', '00000000-0000-4000-8000-0000000f00c2', 9000000);
update public.properties set deleted_at = '2026-10-06T09:00:00+07:00' where id = '00000000-0000-4000-8000-0000000000c1';

insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c0001', :'a', '00000000-0000-4000-8000-00000000a0a5', 2800000, '2026-07-26', 'cash'),
  ('00000000-0000-4000-8000-0000000c0002', :'a', '00000000-0000-4000-8000-00000000a0a5', 1000000, '2026-08-27', 'bank_transfer'),
  ('00000000-0000-4000-8000-0000000c0041', :'a', '00000000-0000-4000-8000-00000000a0a5', 1700000, '2026-09-30', 'bank_transfer'),
  ('00000000-0000-4000-8000-0000000c0042', :'a', '00000000-0000-4000-8000-00000000a0a5', 1100000, '2026-10-04', 'bank_transfer'),
  ('00000000-0000-4000-8000-0000000c00b1', :'b', '00000000-0000-4000-8000-00000000b0b1', 2800000, '2026-10-05', 'bank_transfer');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000f0001', 2800000),
  (:'a', '00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000f0002', 1000000),
  (:'a', '00000000-0000-4000-8000-0000000c0041', '00000000-0000-4000-8000-0000000f0004', 1700000),
  (:'a', '00000000-0000-4000-8000-0000000c0042', '00000000-0000-4000-8000-0000000f0004', 1100000),
  (:'b', '00000000-0000-4000-8000-0000000c00b1', '00000000-0000-4000-8000-0000000f00b1', 2800000);

select throws_ok(
  format($$ insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
            values (%L, '00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000f0003', 1) $$, :'a'),
  '23514', 'ESTA_ALLOCATION_EXCEEDS_PAYMENT', 'a payment never allocates more than it brought');
select throws_ok(
  $$ update public.payments set amount_vnd = 999999 where id = '00000000-0000-4000-8000-0000000c0002' $$,
  '23514', 'ESTA_ALLOCATION_EXCEEDS_PAYMENT', 'a payment cannot shrink below what it already settled');
select throws_ok(
  format($$ insert into public.payments (id, household_id, amount_vnd, received_on, method) values
            ('00000000-0000-4000-8000-0000000c0099', %L, 500000, '2026-10-06', 'cash');
            insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
            values (%L, '00000000-0000-4000-8000-0000000c0099', '00000000-0000-4000-8000-0000000f0006', 500000) $$, :'a', :'a'),
  '23514', 'ESTA_ALLOCATION_INVOICE_NOT_ISSUED', 'a draft invoice takes no payment');
select throws_ok(
  format($$ insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
            values (%L, '00000000-0000-4000-8000-0000000c0042', '00000000-0000-4000-8000-0000000f0004', 0) $$, :'a'),
  '23514', null, 'an allocation is positive');
select throws_ok(
  format($$ insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
            values (%L, '00000000-0000-4000-8000-0000000c00b1', '00000000-0000-4000-8000-0000000f0003', 1) $$, :'a'),
  '23503', null, 'a payment of household b cannot settle an invoice of household a');
select isnt_empty(
  $$ select 1 from public.audit_log where table_name = 'payment_allocations' and action = 'insert' $$,
  'allocations are audited');

select tests.act_as('viewer.a@test.esta.test');

select results_eq(
  $$ select number, due_date, total_vnd, allocated_vnd, outstanding_vnd, payment_status from public.invoice_balances order by number $$,
  $$ values
    ('DIAN-202601-004', date '2026-10-01', 2800000::bigint, 2800000::bigint, 0::bigint, 'paid'),
    ('DIAN-202602-006', date '2026-10-10', 2800000::bigint, 0::bigint, 2800000::bigint, 'unpaid'),
    ('DIAN-202603-007', date '2026-10-12', 2800000::bigint, 0::bigint, 2800000::bigint, 'unpaid'),
    ('DIAN-202607-001', date '2026-07-25', 2800000::bigint, 2800000::bigint, 0::bigint, 'paid'),
    ('DIAN-202608-002', date '2026-08-25', 2800000::bigint, 1000000::bigint, 1800000::bigint, 'partial'),
    ('DIAN-202609-003', date '2026-09-25', 2800000::bigint, 0::bigint, 2800000::bigint, 'unpaid'),
    ('DIAN-202610-005', date '2026-10-25', 2800000::bigint, 0::bigint, 2800000::bigint, 'unpaid'),
    ('DIAN-202611-008', date '2026-11-25', 2800000::bigint, 0::bigint, 2800000::bigint, 'unpaid') $$,
  'a viewer reads each invoice of the household with its balance; two transfers settle 004');
select results_eq(
  $$ select number, unit_label, tenant_name, outstanding_vnd, payment_status from public.collection_candidates('2026-10-01') order by due_date $$,
  $$ values
    ('DIAN-202608-002', 'Phòng 5', 'Hoàng Văn Em Demo', 1800000::bigint, 'partial'),
    ('DIAN-202609-003', 'Phòng 5', 'Hoàng Văn Em Demo', 2800000::bigint, 'unpaid'),
    ('DIAN-202601-004', 'Phòng 5', 'Hoàng Văn Em Demo', 0::bigint, 'paid'),
    ('DIAN-202610-005', 'Phòng 5', 'Hoàng Văn Em Demo', 2800000::bigint, 'unpaid') $$,
  'October: owed invoices from August and September carry in, 001 paid in July does not, and the draft, the void and November are left out (LSE-10)');
select results_eq(
  $$ select number from public.collection_candidates('2026-10-31') order by due_date $$,
  $$ select number from public.collection_candidates('2026-10-01') order by due_date $$,
  'any day of the month picks the same board');
select results_eq(
  $$ select number from public.collection_candidates('2026-09-01') order by due_date $$,
  $$ values ('DIAN-202608-002'), ('DIAN-202609-003') $$,
  'September holds its own invoice and the August one still owed, never October''s');
select is_empty(
  $$ select 1 from public.collection_candidates('2024-12-01') $$,
  'December 2024 has no invoices');
select is_empty(
  format($$ select 1 from public.collection_candidates('2026-10-01') where household_id <> %L $$, :'a'),
  'the board returns no other household''s rows');
select tests.sees_household('public.payments', :'a', true);
select tests.sees_household('public.payment_allocations', :'a', true);
select tests.sees_household('public.payments', :'b', false);
select tests.sees_household('public.payment_allocations', :'b', false);
select tests.sees_household('public.invoice_balances', :'b', false);

select tests.act_as('member.a@test.esta.test');
select throws_ok(
  format($$ insert into public.payments (household_id, amount_vnd, received_on, method) values (%L, 2800000, '2026-10-07', 'cash') $$, :'a'),
  '42501', null, 'a member cannot insert a payment through the API');
select throws_ok(
  $$ update public.payments set amount_vnd = 5000000 where id = '00000000-0000-4000-8000-0000000c0001' $$,
  '42501', null, 'a member cannot change a payment');
select throws_ok(
  $$ delete from public.payments where id = '00000000-0000-4000-8000-0000000c0001' $$,
  '42501', null, 'a member cannot delete a payment');
select throws_ok(
  format($$ insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
            values (%L, '00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000f0003', 1) $$, :'a'),
  '42501', null, 'a member cannot allocate a payment in an arbitrary shape');
select throws_ok(
  $$ update public.payment_allocations set amount_vnd = 2800000 where payment_id = '00000000-0000-4000-8000-0000000c0002' $$,
  '42501', null, 'a member cannot change an allocation');
select throws_ok(
  $$ delete from public.payment_allocations where payment_id = '00000000-0000-4000-8000-0000000c0002' $$,
  '42501', null, 'a member cannot delete an allocation');

select tests.act_as('member.b@test.esta.test');
select results_eq(
  $$ select number, payment_status from public.collection_candidates('2026-10-01') $$,
  $$ values ('B1-202610-001', 'paid') $$,
  'household b sees only its own board');

select tests.act_as('viewer.c@test.esta.test');
select results_eq(
  $$ select number, property_archived, outstanding_vnd from public.collection_candidates('2026-10-01') order by due_date $$,
  $$ values ('SOLD-202609-001', true, 9000000::bigint) $$,
  'an archived property keeps its unpaid invoice on the board, marked archived, and drops the one already paid (#134)');
select results_eq(
  $$ select number from public.collection_candidates('2026-09-01') $$,
  $$ values ('SOLD-202609-001') $$,
  'the unpaid invoice stays in its own month too');
select is_empty(
  $$ select 1 from public.collection_candidates('2026-10-01') where not property_archived $$,
  'a live property is not marked archived');
select tests.act_as('viewer.a@test.esta.test');
select is(
  (select bool_or(property_archived) from public.collection_candidates('2026-10-01')), false,
  'household a, with no archived property, marks nothing archived');

select tests.clear_request();
reset role;
select ok(not has_function_privilege('anon', 'public.collection_candidates(date)', 'execute'), 'anon cannot execute collection_candidates');
select ok(has_function_privilege('authenticated', 'public.collection_candidates(date)', 'execute'), 'authenticated can execute collection_candidates');
select ok(not has_table_privilege('anon', 'public.invoice_balances', 'select'), 'anon cannot read invoice_balances');
select ok(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'public.invoice_balances'::regclass),
  'invoice_balances runs with the reader''s RLS');
select ok(
  (select p.prosecdef is false and p.provolatile = 's' from pg_proc p where p.oid = 'public.collection_candidates(date)'::regprocedure),
  'collection_candidates is a stable security invoker function');
select ok(
  not exists (select 1 from information_schema.role_table_grants g
              where g.grantee = 'authenticated' and g.table_name in ('payments', 'payment_allocations') and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  'authenticated holds no write grant on payments or allocations');

select * from finish();
rollback;
