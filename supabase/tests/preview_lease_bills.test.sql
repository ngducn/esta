begin;
\ir _harness.psql

select plan(12);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

-- Household a: a draft from 2026-03-01 at 9,000,000 billed from the move-in day, and an active lease whose November
-- rent an amendment raises to 6,000,000.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Demo', 'DEMO', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a11', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room'),
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Lan Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, period_anchor, utilities_mode, deposit_vnd,
  paid_through_date, status
) values
  ('00000000-0000-4000-8000-00000000e001', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
   '00000000-0000-4000-8000-00000000a0a1', '2026-03-01', 9000000, 'lease_start', 'metered_by_owner', 18000000, null, 'draft'),
  ('00000000-0000-4000-8000-00000000e002', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
   '00000000-0000-4000-8000-00000000a0a1', '2026-01-01', 5000000, 'calendar_month', 'tenant_direct', 10000000, '2026-09-30', 'active');
insert into public.lease_amendments (household_id, lease_id, effective_period_start, changes) values
  (:'a', '00000000-0000-4000-8000-00000000e002', '2026-11-01', '{"rent_vnd": 6000000}');

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

-- The amended lease's terms as another household's member could type them, its id included.
select jsonb_build_object(
  'id', '00000000-0000-4000-8000-00000000e002', 'start_date', '2026-01-01', 'rent_vnd', 5000000, 'billing_cycle_months', 1,
  'period_anchor', 'calendar_month', 'first_period_proration', 'by_days', 'due_offset_days', 0, 'escalation', '{"kind": "none"}'::jsonb,
  'utilities_mode', 'tenant_direct') as amended_terms \gset

select tests.act_as('member.a@test.esta.test');

select results_eq(
  format($$ select * from public.preview_lease_bills(%L, (select to_jsonb(l) from public.leases l where l.id = '00000000-0000-4000-8000-00000000e001'), '2026-09-30') $$, :'a'),
  $$ select * from public.preview_activation('00000000-0000-4000-8000-00000000e001', '2026-09-30') $$,
  'the terms of a stored draft preview the bills preview_activation shows for it');
select results_eq(
  format($$ select * from public.preview_lease_bills(%L, (select to_jsonb(l) from public.leases l where l.id = '00000000-0000-4000-8000-00000000e001'), '2026-09-30') $$, :'a'),
  $$ values (date '2026-10-01', date '2026-10-31', date '2026-10-01', 9000000::bigint, true), (date '2026-11-01', date '2026-11-30', date '2026-11-01', 9000000::bigint, false) $$,
  'on the database clock''s 2026-10-07 the draft would issue October and draft November');
select is(
  (select rent_vnd from public.lease_schedule(array['00000000-0000-4000-8000-00000000e002'::uuid], '2026-11-30') where period_start = '2026-11-01'),
  6000000::bigint,
  'the stored lease bills November at the amended rent');
select results_eq(
  format($$ select period_start, rent_vnd from public.preview_lease_bills(%L, (select to_jsonb(l) from public.leases l where l.id = '00000000-0000-4000-8000-00000000e002'), '2026-09-30') $$, :'a'),
  $$ values (date '2026-10-01', 5000000::bigint), (date '2026-11-01', 5000000::bigint) $$,
  'terms that carry an amended lease''s id read none of its amendments');
select throws_ok(
  format($$ select * from public.preview_lease_bills(%L, %L::jsonb || '{"billing_cycle_months": 0}') $$, :'a', :'amended_terms'),
  '22023', 'ESTA_LEASE_TERMS', 'a billing cycle outside 1, 3, 6 and 12 months is refused, so the planner never loops on 0');
select throws_ok(
  format($$ select * from public.preview_lease_bills(%L, %L::jsonb - 'due_offset_days') $$, :'a', :'amended_terms'),
  '22023', 'ESTA_LEASE_TERMS', 'terms without a due offset are refused');
select is_empty(
  format($$ select * from public.preview_lease_bills(%L, %L::jsonb - 'start_date') $$, :'a', :'amended_terms'),
  'terms without a start bill nothing, as preview_activation does for such a draft');

select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  format($$ select * from public.preview_lease_bills(%L, %L) $$, :'a', :'amended_terms'),
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'a viewer cannot preview, as preview_activation refuses one');

select tests.act_as('member.b@test.esta.test');
select throws_ok(
  format($$ select * from public.preview_lease_bills(%L, %L) $$, :'a', :'amended_terms'),
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'a member of another household is refused before anything is read');
select results_eq(
  format($$ select period_start, rent_vnd from public.preview_lease_bills(%L, %L) $$, :'b', :'amended_terms'),
  $$ values (date '2026-10-01', 5000000::bigint), (date '2026-11-01', 5000000::bigint) $$,
  'another household''s lease id in the terms reads none of that lease''s amendments');

select tests.clear_request();
reset role;
select ok(not has_function_privilege('anon', 'public.preview_lease_bills(uuid, jsonb, date)', 'execute'), 'anon cannot run the preview');
select ok(has_function_privilege('authenticated', 'public.preview_lease_bills(uuid, jsonb, date)', 'execute'), 'a signed-in member can run the preview');

select * from finish();
rollback;
