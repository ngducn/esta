begin;
\ir _harness.psql

select plan(45);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Căn hộ Thủ Đức', 'THUDUC', 'apartment', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind, list_rent_vnd, available_from) values
  ('00000000-0000-4000-8000-000000000a11', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room', 3000000, null),
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room', 3000000, '2026-08-01'),
  ('00000000-0000-4000-8000-000000000a13', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room', 3000000, null);
insert into public.parties (id, household_id, kind, full_name, phone, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Lê Văn Demo', '0903123456', array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B', null, array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e003', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13',
   '00000000-0000-4000-8000-00000000a0a1', '2025-07-30', '2026-07-29', 3000000, 'ended'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1',
   private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 'active');

select tests.act_as('member.a@test.esta.test');

select lives_ok(
  format($$ insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date)
            values ('00000000-0000-4000-8000-00000000e001', %L, '00000000-0000-4000-8000-0000000000a1',
                    '00000000-0000-4000-8000-000000000a11', '00000000-0000-4000-8000-00000000a0a1', '2026-08-01') $$, :'a'),
  'a member saves a draft lease on Phòng 1 without rent');
select throws_ok(
  $$ update public.leases set status = 'active' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', null, 'activation without rent is refused (LSE-2)');
select is((select status from public.leases where id = '00000000-0000-4000-8000-00000000e001'), 'draft', 'the refused lease stays draft');
select lives_ok(
  $$ update public.leases set rent_vnd = 3000000, deposit_vnd = 3000000 where id = '00000000-0000-4000-8000-00000000e001' $$,
  'a draft takes rent and deposit edits');
select lives_ok(
  $$ update public.leases set status = 'active', paid_through_date = '2026-09-30' where id = '00000000-0000-4000-8000-00000000e001' $$,
  'the complete draft activates with paid_through_date 2026-09-30');

\set plan '''[{"period_start": "2026-10-01", "period_end": "2026-10-31", "due_date": "2026-10-01", "issue_on": "2026-10-01", "lines": [{"kind": "rent", "description": null, "quantity": 1, "unit_price_vnd": 3000000, "amount_vnd": 3000000}]}, {"period_start": "2026-11-01", "period_end": "2026-11-30", "due_date": "2026-11-01", "issue_on": "2026-11-01", "lines": [{"kind": "rent", "description": null, "quantity": 1, "unit_price_vnd": 3000000, "amount_vnd": 3000000}]}]'''

select results_eq(
  format($$ select period_start, due_date, status, created from public.write_invoices('00000000-0000-4000-8000-00000000e001', %L, '2026-10-07', '2026-10-07T02:00:00Z') $$, :plan),
  $$ values (date '2026-10-01', date '2026-10-01', 'issued', true), (date '2026-11-01', date '2026-11-01', 'draft', true) $$,
  'LSE-3: activation on 2026-10-07 issues October due 2026-10-01 and drafts November');
select results_eq(
  format($$ select count(*) filter (where created)::int, count(*)::int from public.write_invoices('00000000-0000-4000-8000-00000000e001', %L, '2026-10-07', '2026-10-07T03:00:00Z') $$, :plan),
  $$ values (0, 2) $$,
  'a second run inserts nothing (unique lease_id, period_start)');
select is((select count(*)::int from public.invoice_lines l join public.invoices i on i.id = l.invoice_id where i.lease_id = '00000000-0000-4000-8000-00000000e001'), 2,
  'each invoice has its one rent line after the rerun');
select results_eq(
  $$ select number, issued_at from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e001' order by period_start $$,
  $$ values ('DIAN-202610-001', timestamptz '2026-10-07T02:00:00Z'), ('DIAN-202611-001', null) $$,
  'numbers read {property code}-{YYYYMM}-{seq} and the rerun keeps the first issue time');
select is_empty(
  $$ select 1 from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e001' and memo_code !~ '^[A-HJ-NP-Z2-9]{8}$' $$,
  'memo codes are 8 characters of A to Z and 2 to 9 without I or O');
select is((select sum(amount_vnd)::bigint from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
           where i.lease_id = '00000000-0000-4000-8000-00000000e001' and i.period_start = '2026-10-01'), 3000000::bigint,
  'the October rent line bills 3000000');

select is_empty(
  $$ update public.invoices set due_date = '2026-10-05' where period_start = '2026-10-01' and lease_id = '00000000-0000-4000-8000-00000000e001' returning 1 $$,
  'a member edits no issued invoice');
select lives_ok(
  $$ update public.invoices set due_date = '2026-11-02' where period_start = '2026-11-01' and lease_id = '00000000-0000-4000-8000-00000000e001' $$,
  'a draft invoice can still change');
select is_empty(
  $$ delete from public.invoices where status = 'issued' returning 1 $$,
  'a member deletes no issued invoice');
select throws_ok(
  $$ insert into public.invoice_lines (household_id, invoice_id, kind, quantity, unit_price_vnd, amount_vnd)
     select household_id, id, 'other', 1, 1000, 1000 from public.invoices where status = 'issued' $$,
  '23514', 'ESTA_INVOICE_ISSUED', 'an issued invoice takes no new line');
select throws_ok(
  $$ delete from public.invoice_lines l using public.invoices i where i.id = l.invoice_id and i.status = 'issued' $$,
  '23514', 'ESTA_INVOICE_ISSUED', 'an issued invoice keeps its lines');
select throws_ok(
  format($$ insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at)
            values (%L, '00000000-0000-4000-8000-00000000e001', '2026-12-01', '2026-12-31', '2026-12-01', '2026-12-01', 'issued', '2026-10-07T00:00:00Z') $$, :'a'),
  '23514', 'ESTA_INVOICE_NOT_DRAFT', 'a member cannot insert an invoice that is already issued');
select throws_ok(
  format($$ insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
            values (%L, '00000000-0000-4000-8000-00000000e001', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01') $$, :'a'),
  '23505', null, 'a second invoice for the same lease period is refused');

select throws_ok(
  $$ update public.leases set rent_vnd = 3500000 where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', 'ESTA_LEASE_TERMS_LOCKED', 'an active lease keeps its money terms');
select throws_ok(
  $$ update public.leases set status = 'draft' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', 'ESTA_LEASE_TRANSITION', 'active never goes back to draft');
select throws_ok(
  $$ update public.leases set status = 'active' where id = '00000000-0000-4000-8000-00000000e003' $$,
  null, null, 'an ended lease is final');
select lives_ok(
  $$ update public.leases set notes = 'Khách quen' where id = '00000000-0000-4000-8000-00000000e001' $$,
  'notes stay writable on an active lease');
select throws_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, status)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-10-07', 3500000, 'active') $$, :'a'),
  '23514', 'ESTA_LEASE_NOT_DRAFT', 'a member inserts drafts only');

select lives_ok(
  format($$ insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd)
            values ('00000000-0000-4000-8000-00000000e002', %L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-12-01', 3000000) $$, :'a'),
  'a second draft on Phòng 1 can be saved');
select throws_ok(
  $$ update public.leases set status = 'active' where id = '00000000-0000-4000-8000-00000000e002' $$,
  '23P01', 'ESTA_LEASE_OVERLAP', 'it cannot activate while the open-ended lease covers its dates');
select throws_ok(
  $$ select * from public.write_invoices('00000000-0000-4000-8000-00000000e002', '[]', '2026-10-07', '2026-10-07T02:00:00Z') $$,
  '55000', 'ESTA_LEASE_NOT_ACTIVE', 'write_invoices refuses a draft lease');
select results_eq(
  $$ delete from public.leases where id in ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e002') returning id $$,
  $$ values ('00000000-0000-4000-8000-00000000e002'::uuid) $$,
  'a member deletes the draft but not the active lease');

select throws_ok(
  $$ delete from public.units where id = '00000000-0000-4000-8000-000000000a11' $$,
  '23503', 'ESTA_UNIT_HAS_LEASES', 'a unit with leases cannot be deleted');
select lives_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id)
            values (%L, '00000000-0000-4000-8000-0000000000a2', private.whole_unit_id('00000000-0000-4000-8000-0000000000a2'),
                    '00000000-0000-4000-8000-00000000a0a1') $$, :'a'),
  'a draft lease on the whole apartment');
select throws_ok(
  format($$ insert into public.units (household_id, property_id, label, kind) values (%L, '00000000-0000-4000-8000-0000000000a2', 'Phòng 1', 'room') $$, :'a'),
  '23503', 'ESTA_WHOLE_UNIT_LEASED', 'a leased whole property cannot be split into rooms');

select results_eq(
  $$ select leased_unit_count, unit_count, vacant_since from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a1' $$,
  $$ values (1, 3, date '2026-07-30') $$,
  'Dĩ An: Phòng 1 leased of 3 units, vacant since the day after Phòng 3''s lease ended, before Phòng 2''s 2026-08-01');
select results_eq(
  $$ select leased_unit_count, unit_count, vacant_since from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a2' $$,
  $$ values (0, 1, null::date) $$,
  'a draft lease does not count as leased');

select isnt_empty(
  $$ select 1 from public.audit_log where table_name = 'leases' and row_id = '00000000-0000-4000-8000-00000000e001' and action = 'update' $$,
  'activation is audited');

select tests.sees_household('public.leases', :'a', true);
select tests.sees_household('public.leases', :'b', false);
select tests.sees_household('public.invoices', :'b', false);
select tests.cannot_write('public.leases', :'b',
  format($$ insert into public.leases (household_id, property_id, unit_id) values (%L, '00000000-0000-4000-8000-0000000000b1', private.whole_unit_id('00000000-0000-4000-8000-0000000000b1')) $$, :'b'));

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.invoices', :'a', true);
select throws_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id) values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12') $$, :'a'),
  '42501', null, 'a viewer cannot write a lease');
select throws_ok(
  $$ select * from public.write_invoices('00000000-0000-4000-8000-00000000e001', '[]', '2026-10-07', '2026-10-07T02:00:00Z') $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'a viewer cannot run invoicing');

select tests.act_as_service('{"x-esta-actor": "system:test"}');
select throws_ok(
  $$ update public.invoices set due_date = '2026-10-05' where period_start = '2026-10-01' and lease_id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', 'ESTA_INVOICE_ISSUED', 'not even the service role edits an issued invoice');

select tests.clear_request();
reset role;
select ok(not has_function_privilege('anon', 'public.write_invoices(uuid, jsonb, date, timestamptz)', 'execute'), 'anon cannot execute write_invoices');
select ok(has_function_privilege('authenticated', 'public.write_invoices(uuid, jsonb, date, timestamptz)', 'execute'), 'authenticated can execute write_invoices');

select * from finish();
rollback;
