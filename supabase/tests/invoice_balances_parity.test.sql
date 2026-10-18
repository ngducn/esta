begin;
\ir _harness.psql

select plan(3);

-- The rows of fixtures/payment_status.csv, which packages/core/src/allocation/status.test.ts writes from
-- derivePaymentStatus; scripts/pgtap-fixtures.test.ts fails when the two differ.
create temporary table expected (name text, total_vnd bigint, allocated_vnd bigint, payment_status text) on commit drop;
insert into expected values
    ('nothing allocated', 3500000::bigint, 0::bigint, 'unpaid'),
    ('one dong allocated', 3500000::bigint, 1::bigint, 'partial'),
    ('first of two transfers', 3500000::bigint, 2000000::bigint, 'partial'),
    ('one dong short', 3500000::bigint, 3499999::bigint, 'partial'),
    ('exact total', 3500000::bigint, 3500000::bigint, 'paid'),
    ('two transfers summing to the total', 3500000::bigint, 3500000::bigint, 'paid'),
    ('one dong over', 3500000::bigint, 3500001::bigint, 'overpaid'),
    ('override past the total', 3500000::bigint, 4000000::bigint, 'overpaid'),
    ('zero total with nothing allocated', 0::bigint, 0::bigint, 'paid'),
    ('zero total with one dong allocated', 0::bigint, 1::bigint, 'overpaid'),
    ('largest safe total exactly', 9007199254740991::bigint, 9007199254740991::bigint, 'paid'),
    ('largest safe total one dong short', 9007199254740991::bigint, 9007199254740990::bigint, 'partial');

select is((select count(*)::integer from expected), 12, 'every fixture row is here');
select is_empty(
  $$ select name from expected where private.payment_status(total_vnd, allocated_vnd) <> payment_status $$,
  'the SQL derivation matches derivePaymentStatus on every fixture row');

select tests.create_household('a') as a \gset
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a11', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room');
insert into public.leases (id, household_id, property_id, unit_id, start_date, rent_vnd) values
  ('00000000-0000-4000-8000-00000000e001', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11', '2026-01-01', 3500000);
insert into public.payments (id, household_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c0001', :'a', 1000000000000, '2026-10-01', 'bank_transfer');

-- One issued invoice per fixture row that fits the invoice line and allocation ceilings, built from its own amounts:
-- a zero total has no line, and an allocation of zero is no allocation.
create temporary table built on commit drop as
select e.name, gen_random_uuid() as id, row_number() over (order by e.name) as n, e.total_vnd, e.allocated_vnd
from expected e where e.total_vnd <= 1000000000000;
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at)
select b.id, :'a', '00000000-0000-4000-8000-00000000e001', date '2020-01-01' + b.n::integer, date '2020-01-01' + b.n::integer,
       date '2026-10-01', date '2026-10-01', 'issued', '2026-10-01T00:30:00+07:00'
from built b;
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select :'a', b.id, 'rent', b.total_vnd, b.total_vnd from built b where b.total_vnd > 0;
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
select :'a', '00000000-0000-4000-8000-0000000c0001', b.id, b.allocated_vnd from built b where b.allocated_vnd > 0;

grant select on expected, built to authenticated;

select tests.act_as('viewer.a@test.esta.test');
select results_eq(
  $$ select b.name, v.total_vnd, v.allocated_vnd, v.outstanding_vnd, v.payment_status
     from built b join public.invoice_balances v on v.id = b.id order by b.name $$,
  $$ select name, total_vnd, allocated_vnd, greatest(total_vnd - allocated_vnd, 0), payment_status
     from expected where total_vnd <= 1000000000000 order by name $$,
  'invoice_balances reads each fixture invoice''s total, allocation and status as derivePaymentStatus does');

select * from finish();
rollback;
