begin;
\ir _harness.psql

select plan(51);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

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

reset role;
select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
     where p.oid in ('private.meter_lines(public.leases)'::regprocedure, 'private.refresh_meter_lines(public.leases)'::regprocedure,
                     'private.readings_complete(public.leases, date)'::regprocedure, 'private.issue_invoices(uuid, date, timestamptz)'::regprocedure,
                     'public.save_meter_readings(uuid, date, jsonb)'::regprocedure)
       and p.prosrc ~* '\m(now|current_date|current_timestamp|localtimestamp|clock_timestamp|statement_timestamp|transaction_timestamp)\M' $$,
  'metered billing reads no clock but the database clock it is given');
select ok(not has_function_privilege('authenticated', 'private.meter_lines(public.leases)', 'execute'), 'a member cannot call the line planner');
select ok(not has_function_privilege('anon', 'public.save_meter_readings(uuid, date, jsonb)', 'execute'), 'anon cannot save readings');

select * from finish();
rollback;
