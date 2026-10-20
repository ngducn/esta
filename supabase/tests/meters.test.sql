begin;
\ir _harness.psql

select plan(89);

select tests.create_household('a') as a, tests.create_household('b') as b, tests.create_household('c') as c, tests.create_household('d') as d \gset

-- Dĩ An on the database clock's 02/11/2026. Phòng 1 and Phòng 2 bill from the 25th with owner-metered utilities; their
-- October bills went out on 03/10 when September's readings, each meter's first, were complete. Phòng 3 has meters
-- and no lease. Household b has a meter of its own.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Nhà Demo khác', 'KHAC', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Dãy trọ B', 'B1', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a11', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room'),
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room'),
  ('00000000-0000-4000-8000-000000000a13', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room'),
  ('00000000-0000-4000-8000-000000000a21', :'a', '00000000-0000-4000-8000-0000000000a2', 'Phòng 1', 'room'),
  ('00000000-0000-4000-8000-000000000b11', :'b', '00000000-0000-4000-8000-0000000000b1', 'Phòng 1', 'room');
insert into public.meters (id, household_id, property_id, unit_id, kind, pricing) values
  ('00000000-0000-4000-8000-00000000d11e', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'),
  ('00000000-0000-4000-8000-00000000d11a', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11', 'water', '{"kind": "flat", "unit_price_vnd": 18000}'),
  ('00000000-0000-4000-8000-00000000d12e', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'),
  ('00000000-0000-4000-8000-00000000d12a', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12', 'water', '{"kind": "flat", "unit_price_vnd": 18000}'),
  ('00000000-0000-4000-8000-00000000d13e', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'),
  ('00000000-0000-4000-8000-00000000d21e', :'a', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000a21', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'),
  ('00000000-0000-4000-8000-00000000db1e', :'b', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000b11', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}');
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on) values
  (:'a', '00000000-0000-4000-8000-00000000d11e', '2026-09-01', 2847, '2026-10-03'),
  (:'a', '00000000-0000-4000-8000-00000000d11a', '2026-09-01', 312, '2026-10-03'),
  (:'a', '00000000-0000-4000-8000-00000000d12e', '2026-09-01', 4120, '2026-10-03'),
  (:'a', '00000000-0000-4000-8000-00000000d12a', '2026-09-01', 405, '2026-10-03'),
  (:'b', '00000000-0000-4000-8000-00000000db1e', '2026-09-01', 100, '2026-10-03');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Nguyễn Văn An Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, paid_through_date, status
)
select ('00000000-0000-4000-8000-00000000e01' || k)::uuid, :'a', '00000000-0000-4000-8000-0000000000a1',
  ('00000000-0000-4000-8000-000000000a1' || k)::uuid, '00000000-0000-4000-8000-00000000a0a1', '2025-03-25', '2027-06-24', 2500000, 1,
  'lease_start', 'metered_by_owner', 0, '2026-10-24', 'active'
from (values ('1'), ('2')) as room (k);
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at)
select ('00000000-0000-4000-8000-0000000f010' || k)::uuid, :'a', ('00000000-0000-4000-8000-00000000e01' || k)::uuid,
  '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'issued', '2026-10-03T00:30:00+07:00'
from (values ('1'), ('2')) as room (k);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select :'a', id, 'rent', 2500000, 2500000 from public.invoices where household_id = :'a';

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-11-02T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

-- Readings sit between their neighbours, whoever writes them.
select throws_ok($$ insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on)
  select household_id, id, '2026-10-01', 2000, '2026-11-02' from public.meters where id = '00000000-0000-4000-8000-00000000d11e' $$,
  '23514', 'ESTA_READING_BELOW_PREVIOUS', 'a reading below the month before is refused for any writer');
select throws_ok($$ insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on)
  select household_id, id, '2026-08-01', 3000, '2026-11-02' from public.meters where id = '00000000-0000-4000-8000-00000000d11e' $$,
  '23514', 'ESTA_READING_ABOVE_NEXT', 'a reading above the month after is refused');
select throws_ok($$ insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on)
  select household_id, id, '2026-10-15', 3000, '2026-11-02' from public.meters where id = '00000000-0000-4000-8000-00000000d11e' $$,
  '23514', null, 'a reading month is the first day of its month');
select throws_ok(format($$ insert into public.meters (household_id, property_id, unit_id, kind, pricing)
  values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13', 'water', '{"kind": "flat", "unit_price_vnd": 0}') $$, :'a'),
  '23514', null, 'a meter is priced at 1 ₫ or more a unit');
select throws_ok(format($$ insert into public.meters (household_id, property_id, unit_id, kind, pricing)
  values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11', 'electricity', '{"kind": "flat", "unit_price_vnd": 3000}') $$, :'a'),
  '23505', null, 'a unit has one active meter of each kind');

-- Who sees and writes meters and readings (RLS).
select tests.act_as('member.a@test.esta.test');
select tests.sees_household('public.meters', :'a', true);
select tests.sees_household('public.meters', :'b', false);
select tests.sees_household('public.meter_readings', :'a', true);
select tests.sees_household('public.meter_readings', :'b', false);
select tests.sees_household('public.meter_usage', :'b', false);
select ok(not has_table_privilege('anon', 'public.meter_usage', 'select'), 'anon cannot read meter use');
select lives_ok($$ update public.meters set pricing = '{"kind": "flat", "unit_price_vnd": 18000}' where id = '00000000-0000-4000-8000-00000000d11a' $$,
  'a member changes a meter''s price');
select throws_ok($$ update public.meters set unit_id = '00000000-0000-4000-8000-000000000a13' where id = '00000000-0000-4000-8000-00000000d11a' $$,
  '42501', null, 'a meter keeps its unit');
select throws_ok(format($$ insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on)
  values (%L, '00000000-0000-4000-8000-00000000d11e', '2026-10-01', 3000, '2026-11-02') $$, :'a'),
  '42501', null, 'a member writes readings only through save_meter_readings');
-- tests.cannot_write updates household_id, which a member may not update on meters, so its checks are spelled out.
select throws_ok(format($$ insert into public.meters (household_id, property_id, unit_id, kind, pricing)
    values (%L, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000b11', 'water', '{"kind": "flat", "unit_price_vnd": 1}') $$, :'b'),
  '42501', null, 'public.meters: insert into another household refused');
select is_empty(format($$ update public.meters set serial = 'X' where household_id = %L returning 1 $$, :'b'), 'public.meters: update touches no row of another household');
select is_empty(format($$ delete from public.meters where household_id = %L returning 1 $$, :'b'), 'public.meters: delete touches no row of another household');
select tests.act_as('viewer.a@test.esta.test');
select throws_ok(format($$ insert into public.meters (household_id, property_id, unit_id, kind, pricing)
    values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13', 'water', '{"kind": "flat", "unit_price_vnd": 1}') $$, :'a'),
  '42501', null, 'a viewer cannot add a meter');
select is_empty(format($$ update public.meters set serial = 'X' where household_id = %L returning 1 $$, :'a'), 'a viewer''s meter update touches no row');
select is_empty(format($$ delete from public.meters where household_id = %L returning 1 $$, :'a'), 'a viewer''s meter delete touches no row');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 10}]') $$,
  'P0002', 'ESTA_PROPERTY_NOT_FOUND', 'a viewer cannot save readings');
select tests.act_as('member.b@test.esta.test');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 10}]') $$,
  'P0002', 'ESTA_PROPERTY_NOT_FOUND', 'a member of another household cannot save readings');

-- Saving readings (LSE-4).
select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-12-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 10}]') $$,
  '22023', 'ESTA_READING_MONTH', 'a month after the database clock''s month is refused');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-02',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 10}]') $$,
  '22023', 'ESTA_READING_MONTH', 'a reading month is the first of a month');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 10.5}]') $$,
  '22023', 'ESTA_READING_INVALID', 'a reading is a whole number');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d21e", "reading": 10}]') $$,
  '22023', 'ESTA_READING_METER', 'a meter of another property is refused');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 10}, {"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 11}]') $$,
  '22023', 'ESTA_READING_METER', 'a meter named twice is refused');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d12e", "reading": 4200}, {"meter_id": "00000000-0000-4000-8000-00000000d12a", "reading": 400}]') $$,
  '23514', 'ESTA_READING_BELOW_PREVIOUS', 'a water reading below September''s refuses the whole save');
select is((select count(*)::integer from public.meter_readings where reading_month = '2026-10-01'), 0, 'and nothing of it is saved');

select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 2967}, {"meter_id": "00000000-0000-4000-8000-00000000d11a", "reading": 318}]') $$,
  $$ values (2, 1) $$, 'Phòng 1''s October readings save, and its next bill issues the same day');
select results_eq(
  $$ select i.period_start, i.status, i.issue_on, i.issued_at from public.invoices i
     where i.lease_id = '00000000-0000-4000-8000-00000000e011' and i.period_start = '2026-11-25' $$,
  $$ values ('2026-11-25'::date, 'issued'::text, '2026-11-02'::date, '2026-11-02T09:00:00+07:00'::timestamptz) $$,
  'the bill from 25/11 issued on 02/11, before its due date, since every meter of the room was read');
select results_eq(
  $$ select l.kind, l.quantity::integer, l.unit_price_vnd, l.amount_vnd, l.description, l.reading_month from public.invoice_lines l
     join public.invoices i on i.id = l.invoice_id
     where i.lease_id = '00000000-0000-4000-8000-00000000e011' and i.period_start = '2026-11-25' order by l.sort_order $$,
  $$ values
     ('rent'::text, 1, 2500000::bigint, 2500000::bigint, null::text, null::date),
     ('electricity', 120, 3500, 420000, 'Tiền điện tháng 10/2026: 120 kWh (2.847 → 2.967)', '2026-10-01'),
     ('water', 6, 18000, 108000, 'Tiền nước tháng 10/2026: 6 m³ (312 → 318)', '2026-10-01') $$,
  'it bills October''s consumption of each meter at the meter''s price');
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d12e", "reading": 4290}, {"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 77}]') $$,
  $$ values (2, 0) $$, 'Phòng 2''s electricity and empty Phòng 3 save, and no bill issues');
select results_eq(
  $$ select i.status, array_agg(l.kind order by l.sort_order) from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000e012' and i.period_start = '2026-11-25' group by i.status $$,
  $$ values ('draft'::text, array['rent', 'electricity']) $$,
  'Phòng 2''s bill stays a draft with its electricity line until its water is read');
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 2967}]') $$,
  $$ values (0, 0) $$, 'saving the same reading again changes nothing');
select results_eq($$ select previous_month, previous_reading, used from public.meter_usage where meter_id = '00000000-0000-4000-8000-00000000d11e' order by reading_month $$,
  $$ values (null::date, null::integer, null::integer), ('2026-09-01', 2847, 120) $$, 'meter_usage reads each month''s use from the reading before it');
select is((select read_on from public.meter_readings where meter_id = '00000000-0000-4000-8000-00000000d11e' and reading_month = '2026-10-01'),
  '2026-11-02'::date, 'a reading is read on the database clock''s date');
select results_eq(
  $$ select action, actor_kind from public.audit_log where table_name = 'meter_readings' and row_id =
       (select id from public.meter_readings where meter_id = '00000000-0000-4000-8000-00000000d11e' and reading_month = '2026-10-01') $$,
  $$ values ('insert'::text, 'user'::text) $$, 'the saved reading is audited as the member''s');

-- A reading changed after its bill issued becomes an adjustment on the next draft; the issued bill stays as it is.
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 2977}]') $$,
  $$ values (1, 0) $$, 'raising Phòng 1''s October electricity by 10 saves');
select is((select sum(amount_vnd)::bigint from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
  where i.lease_id = '00000000-0000-4000-8000-00000000e011' and i.period_start = '2026-11-25'), 3028000::bigint,
  'the issued bill from 25/11 keeps its total');

reset role;
select tests.clear_request();
update public.test_clock set frozen_now = '2026-11-26T09:00:00+07:00';
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-26', '2026-11-26T00:30:00+07:00') $$, :'a'),
  'the nightly run on 26/11 drafts December');
select results_eq(
  $$ select l.kind, l.quantity::integer, l.unit_price_vnd, l.amount_vnd, l.description from public.invoice_lines l
     join public.invoices i on i.id = l.invoice_id
     where i.lease_id = '00000000-0000-4000-8000-00000000e011' and i.period_start = '2026-12-25' and i.status = 'draft' order by l.sort_order $$,
  $$ values ('rent'::text, 1, 2500000::bigint, 2500000::bigint, null::text),
            ('adjustment', 10, 3500, 35000, 'Điều chỉnh tiền điện tháng 10/2026: +10 kWh') $$,
  'Phòng 1''s December draft carries the 10 kWh as an adjustment at the meter''s price');
select coalesce(max(id), 0) as audit_before from public.audit_log \gset
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-26', '2026-11-26T00:30:00+07:00') $$, :'a'),
  'a second run the same night');
select is((select count(*)::integer from public.audit_log where id > :audit_before and table_name = 'invoice_lines'), 0,
  'writes no invoice line, since nothing changed');

reset role;
select tests.act_as('member.a@test.esta.test');
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 2963}]') $$,
  $$ values (1, 0) $$, 'lowering it to 4 kWh under the billed reading saves');
select results_eq(
  $$ select l.quantity::integer, l.unit_price_vnd, l.amount_vnd, l.description from public.invoice_lines l
     join public.invoices i on i.id = l.invoice_id
     where i.lease_id = '00000000-0000-4000-8000-00000000e011' and i.period_start = '2026-12-25' and l.kind = 'adjustment' $$,
  $$ values (4, -3500::bigint, -14000::bigint, 'Điều chỉnh tiền điện tháng 10/2026: -4 kWh') $$,
  'and the draft''s adjustment becomes a credit of 4 kWh');
select lives_ok($$ select public.void_invoice((select id from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e011' and period_start = '2026-11-25'), 'Demo: gửi nhầm') $$,
  'Mẹ voids Phòng 1''s bill from 25/11');
reset role;
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-26', '2026-11-26T00:30:00+07:00') $$, :'a'), 'the nightly run after the void');
select results_eq(
  $$ select l.kind, l.quantity::integer, l.amount_vnd from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
     where i.lease_id = '00000000-0000-4000-8000-00000000e011' and i.period_start = '2026-12-25' and l.kind = 'adjustment' order by l.amount_vnd $$,
  $$ values ('adjustment'::text, 6, 108000::bigint), ('adjustment', 116, 406000) $$,
  'bills October''s whole use on the December draft, since the void bill charged nothing');
reset role;
select tests.act_as('member.a@test.esta.test');
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d12a", "reading": 409}]') $$,
  $$ values (1, 0) $$, 'Phòng 2''s water read late, after its bill issued on its due date');
select results_eq(
  $$ select i.period_start, l.kind, l.amount_vnd from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
     where i.lease_id = '00000000-0000-4000-8000-00000000e012' and l.kind <> 'rent' order by i.period_start, l.sort_order $$,
  $$ values ('2026-11-25'::date, 'electricity'::text, 595000::bigint), ('2026-12-25', 'adjustment', 72000) $$,
  'goes on the December draft as an adjustment, beside the electricity November already billed');

-- [app rule] A month's use stops at 100.000, so a typed extra digit never reaches a bill line (the line holds at most
-- 1.000.000.000.000 ₫, and a meter's price at most 9.999.999 ₫).
reset role;
select throws_ok($$ insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on)
  select household_id, id, '2026-10-01', 100101, '2026-11-02' from public.meters where id = '00000000-0000-4000-8000-00000000db1e' $$,
  '23514', 'ESTA_READING_USE_TOO_LARGE', 'a month used past 100.000 is refused for any writer');
select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-11-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 999999999}]') $$,
  '23514', 'ESTA_READING_USE_TOO_LARGE', 'a reading of 999999999 is refused before any bill is planned');
select lives_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-11-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 100077}]') $$,
  'exactly 100.000 in a month saves');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 0}]') $$,
  '23514', 'ESTA_READING_USE_TOO_LARGE', 'lowering October is refused when it would make November''s use pass 100.000');

-- Each month bills once (LSE-4). Phòng 2 B bills from the 25th and is paid through 10/11, so its bills from 11/11 and
-- 25/11 both start in November; Phòng 3 B bills by quarter from the 25th, paid through 10/11, so its bill from 11/11
-- covers two months and the next, from 25/01, three.
reset role;
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000b12', :'b', '00000000-0000-4000-8000-0000000000b1', 'Phòng 2 B', 'room'),
  ('00000000-0000-4000-8000-000000000b13', :'b', '00000000-0000-4000-8000-0000000000b1', 'Phòng 3 B', 'room');
insert into public.meters (id, household_id, property_id, unit_id, kind, pricing) values
  ('00000000-0000-4000-8000-00000000db2e', :'b', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000b12', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'),
  ('00000000-0000-4000-8000-00000000db3e', :'b', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000b13', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}');
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on) values
  (:'b', '00000000-0000-4000-8000-00000000db2e', '2026-09-01', 100, '2026-10-01'),
  (:'b', '00000000-0000-4000-8000-00000000db2e', '2026-10-01', 220, '2026-11-01');
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, paid_through_date, status
) values
  ('00000000-0000-4000-8000-00000000eb02', :'b', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000b12',
   (select id from public.parties where household_id = :'b' limit 1), '2025-03-25', '2027-06-24', 2500000, 1, 'lease_start', 'metered_by_owner', 0, '2026-11-10', 'active');
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-02', '2026-11-02T00:30:00+07:00') $$, :'b'), 'Phòng 2 B''s nightly run on 02/11');
select results_eq(
  $$ select i.period_start, i.status, coalesce(sum(l.quantity) filter (where l.meter_id is not null), 0)::integer
     from public.invoices i left join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000eb02' group by i.id order by i.period_start $$,
  $$ values ('2026-11-11'::date, 'issued'::text, 120), ('2026-11-25', 'draft', 0) $$,
  'October goes on the bill from 11/11, which issues as soon as October is read; the bill from 25/11 owns no month and waits for its due date');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-26', '2026-11-26T00:30:00+07:00') $$, :'b'), 'and the run on 26/11 issues it');
select results_eq(
  $$ select l.reading_month, count(*)::integer, sum(case when l.unit_price_vnd < 0 then -l.quantity else l.quantity end)::integer
     from public.invoice_lines l where l.meter_id = '00000000-0000-4000-8000-00000000db2e' group by l.reading_month $$,
  $$ values ('2026-10-01'::date, 1, 120) $$,
  'so October is billed once in all');

reset role;
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on) values
  (:'b', '00000000-0000-4000-8000-00000000db3e', '2026-08-01', 1000, '2026-09-01'),
  (:'b', '00000000-0000-4000-8000-00000000db3e', '2026-09-01', 1100, '2026-10-01'),
  (:'b', '00000000-0000-4000-8000-00000000db3e', '2026-10-01', 1250, '2026-11-01'),
  (:'b', '00000000-0000-4000-8000-00000000db3e', '2026-11-01', 1300, '2026-12-01'),
  (:'b', '00000000-0000-4000-8000-00000000db3e', '2026-12-01', 1420, '2026-12-20');
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, paid_through_date, status
) values
  ('00000000-0000-4000-8000-00000000eb03', :'b', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000b13',
   (select id from public.parties where household_id = :'b' limit 1), '2026-01-25', '2027-12-24', 2500000, 3, 'lease_start', 'metered_by_owner', 0, '2026-11-10', 'active');
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-12-21', '2026-12-21T00:30:00+07:00') $$, :'b'), 'Phòng 3 B''s nightly run on 21/12');
select results_eq(
  $$ select i.period_start, l.reading_month, l.quantity::integer
     from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
     where l.meter_id = '00000000-0000-4000-8000-00000000db3e' order by l.reading_month $$,
  $$ values ('2026-11-11'::date, '2026-09-01'::date, 100), ('2026-11-11', '2026-10-01', 150), ('2027-01-25', '2026-11-01', 50), ('2027-01-25', '2026-12-01', 120) $$,
  'the quarter from 11/11 bills September and October, the next from 25/01 November and December: each month once');

-- Each month bills once across the leases of a room, to the lease chain (a lease and its renewals) that held the room on
-- the month's last day, on the chain's first bill after the month (LSE-4). Household c bills by calendar month with rent
-- due on the 5th, but Phòng 4 C bills from the 25th and Phòng 5 C is due on the 1st. Phòng 1 C's lease runs to 10/11
-- and is renewed on 05/11 after October was read on 02/11. Phòng 2 C and Phòng 3 C change tenant on 11/11; Phòng 2 C's
-- October is read on 02/11, before the old tenant's last bill went out, and Phòng 3 C's on 12/11, after the old lease
-- ended. Phòng 4 C's lease ends 24/11 with its last bill from 25/10, and Phòng 5 C's ends 30/11 with its last bill from
-- 01/11 out before October was read; both are read on 02/11 and renewed on 05/11.
reset role;
select tests.clear_request();
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000c1', :'c', 'Dãy trọ Demo C', 'DEMOC', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind)
select ('00000000-0000-4000-8000-000000000c1' || k)::uuid, :'c', '00000000-0000-4000-8000-0000000000c1', 'Phòng ' || k || ' C', 'room'
from (values ('1'), ('2'), ('3'), ('4'), ('5')) as room (k);
insert into public.meters (id, household_id, property_id, unit_id, kind, pricing)
select ('00000000-0000-4000-8000-00000000dc' || k || 'e')::uuid, :'c', '00000000-0000-4000-8000-0000000000c1', ('00000000-0000-4000-8000-000000000c1' || k)::uuid,
  'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'
from (values ('1'), ('2'), ('3'), ('4'), ('5')) as room (k);
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on)
select :'c', ('00000000-0000-4000-8000-00000000dc' || k || 'e')::uuid, '2026-09-01', 1000 * k::integer, '2026-10-01'
from (values ('1'), ('2'), ('3'), ('4'), ('5')) as room (k);
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000c0a1', :'c', 'individual', 'Người thuê cũ Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000c0b1', :'c', 'individual', 'Người thuê mới Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, paid_through_date, status
) values
  ('00000000-0000-4000-8000-00000000ec11', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c11',
   '00000000-0000-4000-8000-00000000c0a1', '2025-11-11', '2026-11-10', 3000000, 1, 'calendar_month', 'metered_by_owner', 4, '2026-09-30', 'active'),
  ('00000000-0000-4000-8000-00000000ec21', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c12',
   '00000000-0000-4000-8000-00000000c0a1', '2026-01-01', '2026-11-10', 3000000, 1, 'calendar_month', 'metered_by_owner', 4, '2026-09-30', 'active'),
  ('00000000-0000-4000-8000-00000000ec22', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c12',
   '00000000-0000-4000-8000-00000000c0b1', '2026-11-11', '2027-11-10', 3000000, 1, 'calendar_month', 'metered_by_owner', 4, null, 'active'),
  ('00000000-0000-4000-8000-00000000ec31', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c13',
   '00000000-0000-4000-8000-00000000c0a1', '2026-01-01', '2026-11-10', 3000000, 1, 'calendar_month', 'metered_by_owner', 4, '2026-09-30', 'active'),
  ('00000000-0000-4000-8000-00000000ec32', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c13',
   '00000000-0000-4000-8000-00000000c0b1', '2026-11-11', '2027-11-10', 3000000, 1, 'calendar_month', 'metered_by_owner', 4, null, 'active'),
  ('00000000-0000-4000-8000-00000000ec41', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c14',
   '00000000-0000-4000-8000-00000000c0a1', '2025-11-25', '2026-11-24', 3000000, 1, 'lease_start', 'metered_by_owner', 0, '2026-09-24', 'active'),
  ('00000000-0000-4000-8000-00000000ec51', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c15',
   '00000000-0000-4000-8000-00000000c0a1', '2025-12-01', '2026-11-30', 3000000, 1, 'calendar_month', 'metered_by_owner', 0, '2026-09-30', 'active');
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-10-01', '2026-10-01T00:30:00+07:00') $$, :'c'), 'household c''s run on 01/10');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-01', '2026-11-01T00:30:00+07:00') $$, :'c'),
  'and on 01/11, which issues Phòng 5 C''s last bill on its due date, before October is read');
reset role;
update public.test_clock set frozen_now = '2026-11-02T09:00:00+07:00';
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on) values
  (:'c', '00000000-0000-4000-8000-00000000dc1e', '2026-10-01', 1110, '2026-11-02'),
  (:'c', '00000000-0000-4000-8000-00000000dc2e', '2026-10-01', 2110, '2026-11-02');
select tests.act_as('member.c@test.esta.test');
select results_eq($$ select saved, issued, unbilled from public.save_meter_readings('00000000-0000-4000-8000-0000000000c1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000dc4e", "reading": 4100}, {"meter_id": "00000000-0000-4000-8000-00000000dc5e", "reading": 5110}]') $$,
  $$ values (2, 0, 2) $$,
  'Phòng 4 C''s and Phòng 5 C''s October, read on 02/11 when no bill of their leases is left, count as billed to no one for now');
reset role;
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-02', '2026-11-02T00:30:00+07:00') $$, :'c'), 'the run on 02/11, after October is read');
reset role;
update public.test_clock set frozen_now = '2026-11-05T09:00:00+07:00';
select tests.act_as('member.c@test.esta.test');
select lives_ok($$ select public.renew_lease('00000000-0000-4000-8000-00000000ec11', 0) $$, 'Phòng 1 C''s lease is renewed on 05/11');
select lives_ok($$ select public.renew_lease('00000000-0000-4000-8000-00000000ec41', 0), public.renew_lease('00000000-0000-4000-8000-00000000ec51', 0) $$,
  'and so are Phòng 4 C''s and Phòng 5 C''s');
reset role;
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-06', '2026-11-06T00:30:00+07:00') $$, :'c'), 'the run on 06/11');
reset role;
update public.test_clock set frozen_now = '2026-11-06T09:00:00+07:00';
select tests.act_as('member.c@test.esta.test');
select results_eq($$ select saved, issued, unbilled from public.save_meter_readings('00000000-0000-4000-8000-0000000000c1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000dc4e", "reading": 4100}, {"meter_id": "00000000-0000-4000-8000-00000000dc5e", "reading": 5110}]') $$,
  $$ values (0, 0, 0) $$,
  'saved again after the renewals, they no longer count as billed to no one');
reset role;
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok($$ select public.end_expired_leases('2026-11-11') $$, 'the old leases end on 11/11');
reset role;
update public.test_clock set frozen_now = '2026-11-12T09:00:00+07:00';
select tests.act_as('member.c@test.esta.test');
select results_eq($$ select saved, issued, unbilled from public.save_meter_readings('00000000-0000-4000-8000-0000000000c1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000dc3e", "reading": 3100}]') $$,
  $$ values (1, 0, 1) $$,
  'Phòng 3 C''s October, read after its old lease ended with no bill left and no renewal, counts as billed to no one');
reset role;
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-12', '2026-11-12T00:30:00+07:00') $$, :'c'), 'the run on 12/11');
reset role;
select results_eq(
  $$ select l.meter_id, l.reading_month, i.lease_id, sum(case when l.unit_price_vnd < 0 then -l.quantity else l.quantity end)::integer
     from public.invoice_lines l join public.invoices i on i.id = l.invoice_id join public.meters m on m.id = l.meter_id
     where m.property_id = '00000000-0000-4000-8000-0000000000c1' and i.status <> 'void'
     group by l.meter_id, l.reading_month, i.lease_id order by l.meter_id, l.reading_month $$,
  $$ values
     ('00000000-0000-4000-8000-00000000dc1e'::uuid, '2026-10-01'::date, '00000000-0000-4000-8000-00000000ec11'::uuid, 110),
     ('00000000-0000-4000-8000-00000000dc2e', '2026-10-01', '00000000-0000-4000-8000-00000000ec21', 110),
     ('00000000-0000-4000-8000-00000000dc4e', '2026-10-01', (select id from public.leases where renewal_of_lease_id = '00000000-0000-4000-8000-00000000ec41'), 100),
     ('00000000-0000-4000-8000-00000000dc5e', '2026-10-01', (select id from public.leases where renewal_of_lease_id = '00000000-0000-4000-8000-00000000ec51'), 110) $$,
  'October is charged once per room, to the chain that held it on 31/10: never to the new tenants, and on a renewal''s bill when the old lease had none left');
select results_eq(
  $$ select l.meter_id, i.period_start, i.status, l.kind, l.description
     from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
     where l.meter_id in ('00000000-0000-4000-8000-00000000dc4e', '00000000-0000-4000-8000-00000000dc5e') order by l.meter_id $$,
  $$ values
     ('00000000-0000-4000-8000-00000000dc4e'::uuid, '2026-11-25'::date, 'issued'::text, 'electricity'::text, 'Tiền điện tháng 10/2026: 100 kWh (4.000 → 4.100)'::text),
     ('00000000-0000-4000-8000-00000000dc5e', '2026-12-01', 'draft', 'adjustment', 'Điều chỉnh tiền điện tháng 10/2026: +110 kWh') $$,
  'Phòng 4 C''s renewal bills October from 25/11, issued as soon as it is read; Phòng 5 C''s from 01/12 as an adjustment, since 01/11 went out without it');
select is((select count(*)::integer from public.invoices i join public.leases l on l.id = i.lease_id
  where l.renewal_of_lease_id = '00000000-0000-4000-8000-00000000ec11'), 2, 'Phòng 1 C''s renewal has its own bills from 11/11, rent only');
select throws_ok($$ insert into public.invoice_lines (household_id, invoice_id, kind, meter_id, reading_month, quantity, unit_price_vnd, amount_vnd)
  select i.household_id, i.id, 'electricity', '00000000-0000-4000-8000-00000000dc2e', '2026-10-01', 110, 3500, 385000
  from public.invoices i where i.lease_id = '00000000-0000-4000-8000-00000000ec22' order by i.period_start limit 1 $$,
  '23505', null, 'a second electricity line for the same meter and month is refused by the database');

-- A void bill's line no longer holds its month, and a month a bill charged stays with that bill's chain (LSE-4). Phòng 1
-- D's lease (calendar month, due on the 5th) charges November on its bill from 01/12; on 03/12 Mẹ voids that bill, ends
-- the lease on 20/11 and lets the room to a new tenant from 21/11. Phòng 2 D's tenant renews twice: to 24/10/2026, then a
-- month to 24/11, then a year, billing from the 25th.
reset role;
select tests.clear_request();
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000d1', :'d', 'Dãy trọ Demo D', 'DEMOD', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind)
select ('00000000-0000-4000-8000-000000000d1' || k)::uuid, :'d', '00000000-0000-4000-8000-0000000000d1', 'Phòng ' || k || ' D', 'room'
from (values ('1'), ('2')) as room (k);
insert into public.meters (id, household_id, property_id, unit_id, kind, pricing)
select ('00000000-0000-4000-8000-00000000dd' || k || 'e')::uuid, :'d', '00000000-0000-4000-8000-0000000000d1', ('00000000-0000-4000-8000-000000000d1' || k)::uuid,
  'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'
from (values ('1'), ('2')) as room (k);
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on) values
  (:'d', '00000000-0000-4000-8000-00000000dd1e', '2026-09-01', 500, '2026-10-01'),
  (:'d', '00000000-0000-4000-8000-00000000dd2e', '2026-08-01', 1000, '2026-09-01'),
  (:'d', '00000000-0000-4000-8000-00000000dd2e', '2026-09-01', 1100, '2026-10-01');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000d0a1', :'d', 'individual', 'Người thuê cũ Demo D', array['tenant']),
  ('00000000-0000-4000-8000-00000000d0b1', :'d', 'individual', 'Người thuê mới Demo D', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, paid_through_date, status, renewal_of_lease_id
) values
  ('00000000-0000-4000-8000-00000000ed11', :'d', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000d11',
   '00000000-0000-4000-8000-00000000d0a1', '2026-06-01', '2027-05-31', 3000000, 1, 'calendar_month', 'metered_by_owner', 4, '2026-09-30', 'active', null),
  ('00000000-0000-4000-8000-00000000ed12', :'d', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000d11',
   '00000000-0000-4000-8000-00000000d0b1', '2026-11-21', '2027-11-20', 3000000, 1, 'calendar_month', 'metered_by_owner', 4, null, 'draft', null),
  ('00000000-0000-4000-8000-00000000ed21', :'d', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000d12',
   '00000000-0000-4000-8000-00000000d0a1', '2025-10-25', '2026-10-24', 3000000, 1, 'lease_start', 'metered_by_owner', 0, '2026-09-24', 'active', null),
  ('00000000-0000-4000-8000-00000000ed22', :'d', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000d12',
   '00000000-0000-4000-8000-00000000d0a1', '2026-10-25', '2026-11-24', 3000000, 1, 'lease_start', 'metered_by_owner', 0, null, 'active',
   '00000000-0000-4000-8000-00000000ed21'),
  ('00000000-0000-4000-8000-00000000ed23', :'d', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000d12',
   '00000000-0000-4000-8000-00000000d0a1', '2026-11-25', '2027-11-24', 3000000, 1, 'lease_start', 'metered_by_owner', 0, null, 'active',
   '00000000-0000-4000-8000-00000000ed22');
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-10-01', '2026-10-01T00:30:00+07:00') $$, :'d'), 'household d''s run on 01/10');
reset role;
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on) values
  (:'d', '00000000-0000-4000-8000-00000000dd1e', '2026-10-01', 600, '2026-11-02'),
  (:'d', '00000000-0000-4000-8000-00000000dd2e', '2026-10-01', 1250, '2026-11-02');
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-02', '2026-11-02T00:30:00+07:00') $$, :'d'), 'and on 02/11, after October is read');
reset role;
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on) values
  (:'d', '00000000-0000-4000-8000-00000000dd1e', '2026-11-01', 680, '2026-12-02');
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-12-02', '2026-12-02T00:30:00+07:00') $$, :'d'),
  'and on 02/12, which issues Phòng 1 D''s bill from 01/12 with November''s 80 kWh');
reset role;
update public.test_clock set frozen_now = '2026-12-03T09:00:00+07:00';
select tests.act_as('member.d@test.esta.test');
select lives_ok($$ select public.void_invoice((select id from public.invoices where lease_id = '00000000-0000-4000-8000-00000000ed11' and period_start = '2026-12-01'), 'Demo: gửi nhầm') $$,
  'on 03/12 Mẹ voids Phòng 1 D''s bill from 01/12');
select results_eq(
  $$ select l.kind, l.live from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
     where i.lease_id = '00000000-0000-4000-8000-00000000ed11' and i.period_start = '2026-12-01' order by l.sort_order $$,
  $$ values ('rent'::text, false), ('electricity', false) $$,
  'and its lines stop charging anything');
select lives_ok($$ select public.terminate_lease('00000000-0000-4000-8000-00000000ed11', '2026-11-20', 'Demo: chuyển đi') $$, 'she ends the lease on 20/11');
select lives_ok($$ select * from public.activate_lease('00000000-0000-4000-8000-00000000ed12') $$, 'and lets the room to a new tenant from 21/11');
select results_eq(
  $$ select i.period_start, i.status, (count(l.id) filter (where l.meter_id is not null))::integer
     from public.invoices i left join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000ed12' group by i.id order by i.period_start $$,
  $$ values ('2026-12-01'::date, 'draft'::text, 0), ('2027-01-01', 'draft', 0) $$,
  'the new tenant is never charged the November the old tenant''s bill charged, so their first bill waits for its due date');
select results_eq($$ select saved, issued, unbilled from public.save_meter_readings('00000000-0000-4000-8000-0000000000d1', '2026-11-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000dd1e", "reading": 680}]') $$,
  $$ values (0, 0, 1) $$,
  'saving November again counts it as billed to no one, for the old tenant to settle');
reset role;
select results_eq(
  $$ select l.meter_id, l.reading_month, i.lease_id, sum(case when l.unit_price_vnd < 0 then -l.quantity else l.quantity end)::integer
     from public.invoice_lines l join public.invoices i on i.id = l.invoice_id join public.meters m on m.id = l.meter_id
     where m.property_id = '00000000-0000-4000-8000-0000000000d1' and i.status <> 'void'
     group by l.meter_id, l.reading_month, i.lease_id order by l.meter_id, l.reading_month $$,
  $$ values
     ('00000000-0000-4000-8000-00000000dd1e'::uuid, '2026-10-01'::date, '00000000-0000-4000-8000-00000000ed11'::uuid, 100),
     ('00000000-0000-4000-8000-00000000dd2e', '2026-09-01', '00000000-0000-4000-8000-00000000ed22', 100),
     ('00000000-0000-4000-8000-00000000dd2e', '2026-10-01', '00000000-0000-4000-8000-00000000ed23', 150) $$,
  'each month is charged once on bills that are not void: the voided November to no one, and each renewal''s first bill carries the month before it');

reset role;
select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
     where p.oid in ('private.meter_lines(public.leases)'::regprocedure, 'private.refresh_meter_lines(public.leases)'::regprocedure,
                     'private.readings_complete(public.leases, date)'::regprocedure, 'private.issue_invoices(uuid, date, timestamptz)'::regprocedure,
                     'public.save_meter_readings(uuid, date, jsonb)'::regprocedure, 'private.lease_chain(uuid)'::regprocedure,
                     'private.room_holder(uuid, date)'::regprocedure, 'private.meter_month_owner(uuid, date)'::regprocedure)
       and p.prosrc ~* '\m(now|current_date|current_timestamp|localtimestamp|clock_timestamp|statement_timestamp|transaction_timestamp)\M' $$,
  'metered billing reads no clock but the database clock it is given');
select ok(not has_function_privilege('authenticated', 'private.meter_lines(public.leases)', 'execute'), 'a member cannot call the line planner');
select ok(not has_function_privilege('anon', 'public.save_meter_readings(uuid, date, jsonb)', 'execute'), 'anon cannot save readings');

select * from finish();
rollback;
