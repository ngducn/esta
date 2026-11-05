begin;
\ir _harness.psql

select plan(5);

select tests.create_household('a') as a \gset

-- Three rooms whose lease ids sort the opposite way to their room order, and a fourth room already billed in October,
-- so the night's first new number is 002.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000007a1', :'a', 'Dãy trọ thứ tự Demo', 'ORDR', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000007a2', :'a', 'Dãy trọ khác Demo', 'ORDS', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind, sort_order) values
  ('00000000-0000-4000-8000-000000007a11', :'a', '00000000-0000-4000-8000-0000000007a1', 'Phòng 1', 'room', 0),
  ('00000000-0000-4000-8000-000000007a12', :'a', '00000000-0000-4000-8000-0000000007a1', 'Phòng 2', 'room', 1),
  ('00000000-0000-4000-8000-000000007a13', :'a', '00000000-0000-4000-8000-0000000007a1', 'Phòng 3', 'room', 2),
  ('00000000-0000-4000-8000-000000007a14', :'a', '00000000-0000-4000-8000-0000000007a1', 'Phòng 4', 'room', 3),
  ('00000000-0000-4000-8000-000000007a21', :'a', '00000000-0000-4000-8000-0000000007a2', 'Phòng 1', 'room', 0);
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a7a1', :'a', 'individual', 'Người thuê thứ tự Demo', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor, due_offset_days, utilities_mode, status) values
  ('00000000-0000-4000-8000-00000000e703', :'a', '00000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-000000007a11', '00000000-0000-4000-8000-00000000a7a1', '2026-10-01', null, 2000000, 1, 'calendar_month', 0, 'tenant_direct', 'active'),
  ('00000000-0000-4000-8000-00000000e702', :'a', '00000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-000000007a12', '00000000-0000-4000-8000-00000000a7a1', '2026-10-01', null, 2000000, 1, 'calendar_month', 0, 'tenant_direct', 'active'),
  ('00000000-0000-4000-8000-00000000e701', :'a', '00000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-000000007a13', '00000000-0000-4000-8000-00000000a7a1', '2026-10-01', null, 2000000, 1, 'calendar_month', 0, 'tenant_direct', 'active'),
  ('00000000-0000-4000-8000-00000000e700', :'a', '00000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-000000007a14', '00000000-0000-4000-8000-00000000a7a1', '2026-09-01', null, 2000000, 1, 'calendar_month', 0, 'tenant_direct', 'active'),
  ('00000000-0000-4000-8000-00000000e7b1', :'a', '00000000-0000-4000-8000-0000000007a2', '00000000-0000-4000-8000-000000007a21', '00000000-0000-4000-8000-00000000a7a1', '2026-10-01', null, 2000000, 1, 'calendar_month', 0, 'tenant_direct', 'active');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at, number) values
  ('00000000-0000-4000-8000-0000000f07a0', :'a', '00000000-0000-4000-8000-00000000e700', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'issued', '2026-10-01T00:30:00+07:00', 'ORDR-202610-001');

create temporary table numbers_before as select i.lease_id, i.number from public.invoices i where i.status = 'issued';
select * from public.run_invoicing(:'a', '2026-10-07', '2026-10-07T09:00:00+07:00');

select is(
  (select array_agg(i.number order by u.sort_order) from public.invoices i join public.leases l on l.id = i.lease_id join public.units u on u.id = l.unit_id
   where i.period_start = '2026-10-01' and l.property_id = '00000000-0000-4000-8000-0000000007a1' and i.lease_id <> '00000000-0000-4000-8000-00000000e700'),
  array['ORDR-202610-002', 'ORDR-202610-003', 'ORDR-202610-004'],
  'one run numbers a property''s new bills in room order, though the lease ids sort the other way'
);
select is((select i.number from public.invoices i where i.lease_id = '00000000-0000-4000-8000-00000000e7b1' and i.period_start = '2026-10-01'), 'ORDS-202610-001', 'another property counts from 001 on its own');
select is((select i.number from public.invoices i where i.id = '00000000-0000-4000-8000-0000000f07a0'), 'ORDR-202610-001', 'a number already issued does not change');
select is((select count(*)::integer from public.invoices i join numbers_before b on b.lease_id = i.lease_id and b.number = i.number), (select count(*)::integer from numbers_before), 'and no issued bill was renumbered');
select is((select count(distinct i.number)::integer from public.invoices i where i.household_id = :'a'), (select count(*)::integer from public.invoices i where i.household_id = :'a'), 'every number is still unique');

select * from finish();
rollback;
