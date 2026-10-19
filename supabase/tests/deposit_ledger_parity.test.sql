begin;
\ir _harness.psql

select plan(3);

-- The rows of fixtures/deposit_ledgers.csv, which packages/core/src/allocation/deposits.test.ts writes from
-- deriveDepositLedger; scripts/pgtap-fixtures.test.ts fails when the two differ.
create temporary table expected (name text, entry integer, kind text, amount_vnd bigint, on_date date, outcome text) on commit drop;
insert into expected values
    ('received only', 1, 'received', 3500000::bigint, '2025-09-15', '3500000'),
    ('received then applied deducted and refunded to zero', 1, 'received', 7000000::bigint, '2025-01-10', '0'),
    ('received then applied deducted and refunded to zero', 2, 'applied', 3500000::bigint, '2026-07-25', '0'),
    ('received then applied deducted and refunded to zero', 3, 'deduction', 500000::bigint, '2026-07-29', '0'),
    ('received then applied deducted and refunded to zero', 4, 'refunded', 3000000::bigint, '2026-08-05', '0'),
    ('two receipts on one day', 1, 'received', 2000000::bigint, '2026-03-01', '3000000'),
    ('two receipts on one day', 2, 'received', 1000000::bigint, '2026-03-01', '3000000'),
    ('refund on the day of the receipt', 1, 'received', 2800000::bigint, '2026-10-01', '0'),
    ('refund on the day of the receipt', 2, 'refunded', 2800000::bigint, '2026-10-01', '0'),
    ('deduction of the last dong', 1, 'received', 2800000::bigint, '2025-09-16', '0'),
    ('deduction of the last dong', 2, 'deduction', 2800000::bigint, '2026-10-07', '0'),
    ('refund one dong past the held balance', 1, 'received', 2800000::bigint, '2025-09-16', 'refused'),
    ('refund one dong past the held balance', 2, 'refunded', 2800001::bigint, '2026-10-07', 'refused'),
    ('refund dated before the receipt', 1, 'received', 2800000::bigint, '2025-09-16', 'refused'),
    ('refund dated before the receipt', 2, 'refunded', 100000::bigint, '2025-09-15', 'refused'),
    ('receipt backdated between two entries', 1, 'received', 1000000::bigint, '2026-03-01', '2000000'),
    ('receipt backdated between two entries', 2, 'refunded', 1000000::bigint, '2026-03-05', '2000000'),
    ('receipt backdated between two entries', 3, 'received', 2000000::bigint, '2026-03-03', '2000000'),
    ('refund written before the receipt on one day', 1, 'refunded', 1000000::bigint, '2026-03-01', 'refused'),
    ('refund written before the receipt on one day', 2, 'received', 1000000::bigint, '2026-03-01', 'refused'),
    ('applied with nothing received', 1, 'applied', 1::bigint, '2026-10-07', 'refused');

select is((select count(distinct name)::integer from expected), 10, 'every fixture case is here');

select tests.create_household('a') as a \gset
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a17', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 7', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a7', :'a', 'individual', 'Bùi Văn Hùng Demo', array['tenant']);

-- One ended lease per case. Entries of one case share created_at, so ids that follow the fixture's entry order keep
-- same-day entries in the order deriveDepositLedger reads them.
create temporary table cases on commit drop as
select name, n, format('00000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid as lease_id
from (select name, row_number() over (order by name) as n from (select distinct name from expected) named) numbered;
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status)
select c.lease_id, :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a17',
  '00000000-0000-4000-8000-00000000a0a7', '2025-01-01', '2025-12-31', 2800000, 'ended'
from cases c;
create temporary table rows_in on commit drop as
select e.*, c.lease_id,
  format('00000000-0000-4000-a000-%s', lpad((c.n * 100 + e.entry)::text, 12, '0'))::uuid as entry_id,
  format('00000000-0000-4000-9000-%s', lpad((c.n * 100 + e.entry)::text, 12, '0'))::uuid as payment_id
from expected e join cases c using (name);
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method, source)
select payment_id, :'a', '00000000-0000-4000-8000-00000000a0a7', amount_vnd, on_date, 'deposit', 'deposit_application'
from rows_in where kind = 'applied';
insert into public.deposit_entries (id, household_id, lease_id, kind, amount_vnd, on_date, note, payment_id)
select entry_id, :'a', lease_id, kind, amount_vnd, on_date,
  case when kind = 'deduction' then 'Demo' end, case when kind = 'applied' then payment_id end
from rows_in;

select is((select count(*)::integer from public.deposit_entries where household_id = :'a'), (select count(*)::integer from expected), 'every fixture entry is in the ledger');
select is_empty(
  $$ select c.name from cases c
     join public.lease_deposits d on d.lease_id = c.lease_id
     join (select distinct name, outcome from expected) e on e.name = c.name
     where case when e.outcome = 'refused' then private.deposit_low_point(c.lease_id) >= 0
       else private.deposit_low_point(c.lease_id) < 0 or d.held_vnd <> e.outcome::bigint end $$,
  'lease_deposits and deposit_low_point match deriveDepositLedger on every fixture case');

select * from finish();
rollback;
