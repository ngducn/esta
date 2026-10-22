begin;
\ir _harness.psql

select plan(21);

select tests.create_household('a') as a \gset

-- Dĩ An on 02/11/2026. Phòng 1 to 3 bill from the 25th with owner-metered utilities; their October bills went out on
-- 03/10 when September's readings were complete. Phòng 3 also has a water meter.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind)
select ('00000000-0000-4000-8000-000000000a1' || k)::uuid, :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng ' || k, 'room'
from (values ('1'), ('2'), ('3')) as room (k);
insert into public.meters (id, household_id, property_id, unit_id, kind, pricing) values
  ('00000000-0000-4000-8000-00000000d11e', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'),
  ('00000000-0000-4000-8000-00000000d12e', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'),
  ('00000000-0000-4000-8000-00000000d13e', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13', 'electricity', '{"kind": "flat", "unit_price_vnd": 3500}'),
  ('00000000-0000-4000-8000-00000000d13a', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13', 'water', '{"kind": "flat", "unit_price_vnd": 18000}');
insert into public.meter_readings (household_id, meter_id, reading_month, reading, read_on) values
  (:'a', '00000000-0000-4000-8000-00000000d11e', '2026-09-01', 2847, '2026-10-03'),
  (:'a', '00000000-0000-4000-8000-00000000d12e', '2026-09-01', 4120, '2026-10-03'),
  (:'a', '00000000-0000-4000-8000-00000000d13e', '2026-09-01', 2847, '2026-10-03'),
  (:'a', '00000000-0000-4000-8000-00000000d13a', '2026-09-01', 312, '2026-10-03');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Nguyễn Văn An Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, paid_through_date, status
)
select ('00000000-0000-4000-8000-00000000e01' || k)::uuid, :'a', '00000000-0000-4000-8000-0000000000a1',
  ('00000000-0000-4000-8000-000000000a1' || k)::uuid, '00000000-0000-4000-8000-00000000a0a1', '2025-03-25', '2027-06-24', 2500000, 1,
  'lease_start', 'metered_by_owner', 0, '2026-10-24', 'active'
from (values ('1'), ('2'), ('3')) as room (k);
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at)
select ('00000000-0000-4000-8000-0000000f010' || k)::uuid, :'a', ('00000000-0000-4000-8000-00000000e01' || k)::uuid,
  '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'issued', '2026-10-03T00:30:00+07:00'
from (values ('1'), ('2'), ('3')) as room (k);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select :'a', id, 'rent', 2500000, 2500000 from public.invoices where household_id = :'a';

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-11-02T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

create function pg_temp.bill_total(p_lease text, p_period_start date) returns bigint language sql as $$
  select sum(l.amount_vnd)::bigint from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
  where i.lease_id = ('00000000-0000-4000-8000-00000000e01' || p_lease)::uuid and i.period_start = p_period_start and i.status <> 'void';
$$;
create function pg_temp.reading(p_meter text, p_month date) returns integer language sql as $$
  select r.reading from public.meter_readings r where r.meter_id = ('00000000-0000-4000-8000-00000000' || p_meter)::uuid and r.reading_month = p_month;
$$;

-- October goes out with an extra digit typed in Phòng 1 and Phòng 2 (27.000 kWh instead of 100).
select tests.act_as('member.a@test.esta.test');
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01', '[
    {"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 29847}, {"meter_id": "00000000-0000-4000-8000-00000000d12e", "reading": 31120},
    {"meter_id": "00000000-0000-4000-8000-00000000d13e", "reading": 2947}, {"meter_id": "00000000-0000-4000-8000-00000000d13a", "reading": 317}]') $$,
  $$ values (4, 3) $$, 'October saves and each room''s bill from 25/11 issues');
select is(pg_temp.bill_total('1', '2026-11-25'), 97000000::bigint, 'Phòng 1''s bill from 25/11 charges the 27.000 kWh');

-- Before December is drafted, a correction's credit waits for it: it must fit in December's rent.
reset role;
select tests.clear_request();
update public.test_clock set frozen_now = '2026-11-03T09:00:00+07:00';
select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 2947}]') $$,
  '55000', 'ESTA_READING_CORRECTION_TOO_LARGE', 'correcting Phòng 1''s October to 100 kWh is refused before December is drafted');
select is(pg_temp.reading('d11e', '2026-10-01'), 29847, 'and the October reading stays as it was');
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 29347}]') $$,
  $$ values (1, 0) $$, 'a correction of 500 kWh, which December''s rent absorbs, saves');

reset role;
select tests.clear_request();
update public.test_clock set frozen_now = '2026-11-26T09:00:00+07:00';
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-11-26', '2026-11-26T00:30:00+07:00') $$, :'a'),
  'the nightly run on 26/11 drafts December');
select is(pg_temp.bill_total('1', '2026-12-25'), 750000::bigint, 'Phòng 1''s December draft carries the 500 kWh credit');

-- Once December is drafted, a correction's credit must fit in it.
reset role;
select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 2947}]') $$,
  '55000', 'ESTA_READING_CORRECTION_TOO_LARGE', 'correcting Phòng 1''s October to 100 kWh is refused');
select is(pg_temp.bill_total('1', '2026-12-25'), 750000::bigint, 'and December''s draft keeps its total');
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d11e", "reading": 29147}]') $$,
  $$ values (1, 0) $$, 'a further 200 kWh, which the draft absorbs, saves');
select results_eq(
  $$ select l.kind, l.quantity::integer, l.unit_price_vnd, l.amount_vnd from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
     where i.lease_id = '00000000-0000-4000-8000-00000000e011' and i.period_start = '2026-12-25' order by l.sort_order $$,
  $$ values ('rent'::text, 1, 2500000::bigint, 2500000::bigint), ('adjustment', 700, -3500, -2450000) $$,
  'and December''s draft carries the 700 kWh credit beside its rent');

-- Phòng 2 (the audit's probe 07): October is corrected after November billed on top of the typo, so the two
-- adjustments cancel; correcting November too leaves October's credit alone on January's draft.
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-11-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d12e", "reading": 31220}]') $$,
  $$ values (1, 1) $$, 'Phòng 2''s November, read on top of the typo, issues December');
reset role;
select tests.clear_request();
update public.test_clock set frozen_now = '2026-12-21T09:00:00+07:00';
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select * from public.run_invoicing(%L, '2026-12-21', '2026-12-21T00:30:00+07:00') $$, :'a'),
  'the nightly run on 21/12 drafts January');
reset role;
select tests.act_as('member.a@test.esta.test');
select results_eq($$ select saved, issued from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-10-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d12e", "reading": 4220}]') $$,
  $$ values (1, 0) $$, 'correcting Phòng 2''s October saves');
select is(pg_temp.bill_total('2', '2027-01-25'), 2500000::bigint, 'since November''s use grows by what October''s shrinks');
select throws_ok($$ select * from public.save_meter_readings('00000000-0000-4000-8000-0000000000a1', '2026-11-01',
  '[{"meter_id": "00000000-0000-4000-8000-00000000d12e", "reading": 4320}]') $$,
  '55000', 'ESTA_READING_CORRECTION_TOO_LARGE', 'correcting November too is refused, since October''s credit would pass January''s bill');
select is(pg_temp.bill_total('2', '2027-01-25'), 2500000::bigint, 'and January''s draft keeps its total');

-- Phòng 3 (the audit's Demo 7): the tenant leaves on 20/11, after the bill from 25/11 carried October's use.
reset role;
select tests.clear_request();
select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select public.terminate_lease('00000000-0000-4000-8000-00000000e013', '2026-11-20', 'Demo: chuyển đi') $$,
  '22023', 'ESTA_TERMINATION_BEFORE_ISSUED', 'ending Phòng 3''s lease before its issued bill is refused');
select lives_ok($$ select public.void_invoice((select id from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e013' and period_start = '2026-11-25'), 'Demo: khách chuyển đi') $$,
  'Mẹ voids the bill from 25/11');
select is(public.terminate_lease('00000000-0000-4000-8000-00000000e013', '2026-11-20', 'Demo: chuyển đi'), 2,
  'ending the lease then says October''s electricity and water can no longer be billed');
select is((select count(*)::integer from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
  where i.lease_id = '00000000-0000-4000-8000-00000000e013' and i.status <> 'void' and l.reading_month = '2026-10-01'), 0,
  'since no live bill of the lease carries October');

select * from finish();
rollback;
