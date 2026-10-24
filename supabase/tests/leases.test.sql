begin;
\ir _harness.psql

select plan(69);

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

-- The database clock on a seeded stack (FND-9): activation and preview read it, never a caller's date.
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

select tests.act_as('member.a@test.esta.test');

select lives_ok(
  format($$ insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date)
            values ('00000000-0000-4000-8000-00000000e001', %L, '00000000-0000-4000-8000-0000000000a1',
                    '00000000-0000-4000-8000-000000000a11', '00000000-0000-4000-8000-00000000a0a1', '2026-08-01') $$, :'a'),
  'a member saves a draft lease on Phòng 1 without rent');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e001', null) $$,
  '23514', null, 'activation without rent is refused (LSE-2)');
select is((select status from public.leases where id = '00000000-0000-4000-8000-00000000e001'), 'draft', 'the refused lease stays draft');
select throws_ok(
  $$ update public.leases set rent_vnd = 0 where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', null, 'a rent of 0 is refused');
select lives_ok(
  $$ update public.leases set rent_vnd = 3000000, deposit_vnd = 3000000 where id = '00000000-0000-4000-8000-00000000e001' $$,
  'a draft takes rent and deposit edits');

-- #186: a rent increase with no interval, a zero step or a zero rounding is refused when it is saved, not at activation.
select throws_ok(
  $$ update public.leases set escalation = '{"kind": "percent", "value": 500}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', null, 'a percent increase without an interval is refused');
select throws_ok(
  $$ update public.leases set escalation = '{"kind": "fixed", "value": 200000, "every_months": 0}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', null, 'an interval of 0 months is refused');
select throws_ok(
  $$ update public.leases set escalation = '{"kind": "percent", "value": 0, "every_months": 12}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', null, 'a percent step of 0 is refused');
select throws_ok(
  $$ update public.leases set escalation = '{"kind": "fixed", "value": 200000, "every_months": 12, "rounding_vnd": 0}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', null, 'a rounding of 0 is refused');
select throws_ok(
  $$ update public.leases set escalation = '{"kind": "percent", "value": "5", "every_months": 12}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', null, 'a step written as text is refused');
select throws_ok(
  $$ update public.leases set escalation = '{"kind": "percent", "value": 500, "every_months": 12.5}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', null, 'a fractional interval is refused');
select lives_ok(
  $$ update public.leases set escalation = '{"kind": "percent", "value": 500, "every_months": 12, "rounding_vnd": 1000}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  'a whole percent step with its interval is saved');
select lives_ok(
  $$ update public.leases set escalation = '{"kind": "none"}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  'no increase is saved');
select ok(not has_function_privilege('anon', 'private.jsonb_whole_between(jsonb, bigint, bigint)', 'execute'), 'anon cannot run the escalation shape helper');
select is(private.jsonb_whole_between('500'::jsonb, 1, 10000), true, 'a member runs the helper on a whole number without a permission error (#128)');
select tests.act_as_service('{"x-esta-actor": "system:test"}');
select lives_ok(
  $$ update public.leases set escalation = '{"kind": "percent", "value": 500, "every_months": 12}' where id = '00000000-0000-4000-8000-00000000e001' $$,
  'the service role, which the agent and cron write leases with, passes the escalation check');
select tests.act_as('member.a@test.esta.test');
select throws_ok(
  $$ update public.leases set status = 'active', paid_through_date = '2026-09-30' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '42501', 'permission denied for table leases', 'a member cannot activate by writing the status, which would skip issuance (#144)');
select results_eq(
  $$ select period_start, period_end, due_date, rent_vnd, issues_now from public.preview_activation('00000000-0000-4000-8000-00000000e001', '2026-09-30') $$,
  $$ values (date '2026-10-01', date '2026-10-31', date '2026-10-01', 3000000::bigint, true), (date '2026-11-01', date '2026-11-30', date '2026-11-01', 3000000::bigint, false) $$,
  'the preview shows what activation will bill on the database clock''s 2026-10-07');

select results_eq(
  $$ select period_start, period_end, due_date, status from public.activate_lease('00000000-0000-4000-8000-00000000e001', '2026-09-30') $$,
  $$ values (date '2026-10-01', date '2026-10-31', date '2026-10-01', 'issued'), (date '2026-11-01', date '2026-11-30', date '2026-11-01', 'draft') $$,
  'LSE-3: activation on 2026-10-07 issues October due 2026-10-01 and drafts November');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e001', '2026-10-31') $$,
  '55000', 'ESTA_LEASE_ALREADY_ACTIVE', 'a second activation, from another tab, is refused as already active');
select results_eq(
  $$ select l.paid_through_date, (select count(*)::int from public.invoices i where i.lease_id = l.id) from public.leases l where l.id = '00000000-0000-4000-8000-00000000e001' $$,
  $$ values (date '2026-09-30', 2) $$,
  'the second activation changes neither the paid-through date nor the invoices');
select results_eq(
  $$ select number, issued_at from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e001' order by period_start $$,
  $$ values ('DIAN-202610-001', timestamptz '2026-10-07T09:00:00+07:00'), ('DIAN-202611-001', null) $$,
  'numbers read {property code}-{YYYYMM}-{seq} and the issue time is the database clock''s');
select is_empty(
  $$ select 1 from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e001' and memo_code !~ '^[A-HJKMNP-Z2-9]{8}$' $$,
  'memo codes are 8 of the 31 characters without 0, O, 1, I or L');
select is((select sum(amount_vnd)::bigint from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
           where i.lease_id = '00000000-0000-4000-8000-00000000e001' and i.period_start = '2026-10-01'), 3000000::bigint,
  'the October rent line bills 3000000');

select throws_ok(
  $$ update public.invoices set status = 'issued', issued_at = '2026-01-01T00:00:00Z' where period_start = '2026-11-01' and lease_id = '00000000-0000-4000-8000-00000000e001' $$,
  '42501', null, 'a member cannot issue a draft, nor back-date its issue time');
select throws_ok(
  $$ update public.invoices set issued_at = '2027-01-01T00:00:00Z' where period_start = '2026-10-01' and lease_id = '00000000-0000-4000-8000-00000000e001' $$,
  '42501', null, 'a member cannot forward-date an issue time');
select throws_ok(
  format($$ insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
            values (%L, '00000000-0000-4000-8000-00000000e001', '2026-10-02', '2026-10-31', '2026-10-02', '2026-10-02') $$, :'a'),
  '42501', null, 'a member cannot double-bill by shifting the period start');
select throws_ok(
  format($$ insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
            values (%L, '00000000-0000-4000-8000-00000000e001', '2026-12-01', '2026-12-31', '2026-12-01', '2026-12-01') $$, :'a'),
  '42501', null, 'a member cannot create an empty invoice to skip a period');
select throws_ok(
  $$ insert into public.invoice_lines (household_id, invoice_id, kind, quantity, unit_price_vnd, amount_vnd)
     select household_id, id, 'other', 1, -3000000, -3000000 from public.invoices where period_start = '2026-11-01' $$,
  '42501', null, 'a member cannot add a line, even to a draft');
select throws_ok(
  $$ delete from public.invoices where period_start = '2026-11-01' $$,
  '42501', null, 'a member cannot delete a draft invoice');
select hasnt_function('public', 'write_invoices', 'no function takes an invoice plan from the caller');

select lives_ok(
  format($$ insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, billing_cycle_months)
            values ('00000000-0000-4000-8000-00000000e004', %L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-08-01', 10000000, 3) $$, :'a'),
  'a quarterly draft on Phòng 2 from 2026-08-01 at 10.000.000 a month');
select results_eq(
  $$ select period_start, period_end, due_date, status from public.activate_lease('00000000-0000-4000-8000-00000000e004', '2026-09-30') $$,
  $$ values (date '2026-10-01', date '2026-10-31', date '2026-10-01', 'issued'), (date '2026-11-01', date '2027-01-31', date '2026-11-01', 'draft') $$,
  'paid through 2026-09-30 inside the August quarter bills from October, due 2026-10-01 (lane 3)');
select results_eq(
  $$ select l.amount_vnd from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
     where i.lease_id = '00000000-0000-4000-8000-00000000e004' order by i.period_start $$,
  $$ values (10108696::bigint), (30000000::bigint) $$,
  'October bills 31 of the quarter''s 92 days of 30.000.000, then the next quarter in full');

select lives_ok(
  format($$ insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, billing_cycle_months)
            values ('00000000-0000-4000-8000-00000000e005', %L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-08-01', 1000000000000, 12) $$, :'a'),
  'a yearly draft on Phòng 3 whose rent line would exceed the line ceiling');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e005', null) $$,
  '23514', null, 'issuance fails on the oversized line');
select results_eq(
  $$ select l.status, l.paid_through_date, (select count(*)::int from public.invoices i where i.lease_id = l.id) from public.leases l where l.id = '00000000-0000-4000-8000-00000000e005' $$,
  $$ values ('draft', null::date, 0) $$,
  'a failed issuance leaves the lease a draft with no invoices: activation is one transaction');

reset role;
select tests.clear_request();
insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on, memo_code)
values (:'a', '00000000-0000-4000-8000-00000000e001', '2026-12-02', '2026-12-31', '2026-12-02', '2026-12-02', 'DEMXDEMX');
select private.issue_invoices('00000000-0000-4000-8000-00000000e001', '2026-11-20', '2026-11-20T00:00:00Z');
select results_eq(
  $$ select period_start from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e001' order by period_start $$,
  $$ values (date '2026-10-01'), (date '2026-11-01'), (date '2026-12-02') $$,
  'a rerun on 2026-11-20 skips December, which overlaps an existing invoice, and adds nothing else');
select private.issue_invoices('00000000-0000-4000-8000-00000000e004', '2026-10-20', '2026-10-20T00:00:00Z');
select is((select count(*)::int from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e004'), 2,
  'a rerun of the quarterly lease plans the same October remainder and inserts nothing');

create sequence pg_temp.memo_draws;
create or replace function private.new_memo_code() returns text language sql set search_path = '' as $$
  select (array['DEMXDEMX', 'BCDEFGHJ'])[least(nextval('pg_temp.memo_draws'), 2)];
$$;
select private.issue_invoices('00000000-0000-4000-8000-00000000e004', '2026-12-30', '2026-12-30T00:00:00Z');
select is((select memo_code from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e004' and period_start = '2027-02-01'), 'BCDEFGHJ',
  'a memo code that collides is drawn again on the unique violation');

select tests.act_as('member.a@test.esta.test');
select lives_ok(
  format($$ insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd)
            values ('00000000-0000-4000-8000-00000000e002', %L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-12-01', 3000000) $$, :'a'),
  'a second draft on Phòng 1 can be saved');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e002', null) $$,
  '23P01', 'ESTA_LEASE_OVERLAP', 'it cannot activate while the open-ended lease covers its dates');
select throws_ok(
  $$ update public.leases set rent_vnd = 3500000 where id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', 'ESTA_LEASE_TERMS_LOCKED', 'an active lease keeps its money terms');
select throws_ok(
  $$ update public.leases set status = 'draft' where id = '00000000-0000-4000-8000-00000000e001' $$,
  '42501', 'permission denied for table leases', 'a member cannot move an active lease back to draft (#144)');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e003', null) $$,
  '23514', 'ESTA_LEASE_TRANSITION', 'an ended lease is final');
select lives_ok(
  $$ update public.leases set notes = 'Khách quen' where id = '00000000-0000-4000-8000-00000000e001' $$,
  'notes stay writable on an active lease');
select throws_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, status)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-10-07', 3500000, 'active') $$, :'a'),
  '23514', 'ESTA_LEASE_NOT_DRAFT', 'a member inserts drafts only');
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
  $$ values (2, 3, date '2026-07-30') $$,
  'Dĩ An: Phòng 1 and 2 leased of 3 units, vacant since the day after Phòng 3''s lease ended');
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
-- tests.cannot_write updates household_id, which a member may not update on leases at all (#144), so its three checks
-- are spelled out with a column a member can write.
select throws_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id) values (%L, '00000000-0000-4000-8000-0000000000b1', private.whole_unit_id('00000000-0000-4000-8000-0000000000b1')) $$, :'b'),
  '42501', null, 'public.leases: insert refused');
select is_empty(format($$ update public.leases set notes = notes where household_id = %L returning 1 $$, :'b'), 'public.leases: update touches no row');
select is_empty(format($$ delete from public.leases where household_id = %L returning 1 $$, :'b'), 'public.leases: delete touches no row');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.invoices', :'a', true);
select throws_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id) values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12') $$, :'a'),
  '42501', null, 'a viewer cannot write a lease');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e005', null) $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'a viewer cannot activate');
select throws_ok(
  $$ select * from public.preview_activation('00000000-0000-4000-8000-00000000e005', null) $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'a viewer gets no preview');

select tests.act_as('member.b@test.esta.test');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e005', null) $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'another household cannot activate the lease');

select tests.act_as_service('{"x-esta-actor": "system:test"}');
select throws_ok(
  $$ update public.invoices set due_date = '2026-10-05' where period_start = '2026-10-01' and lease_id = '00000000-0000-4000-8000-00000000e001' $$,
  '23514', 'ESTA_INVOICE_ISSUED', 'not even the service role edits an issued invoice');

select tests.clear_request();
reset role;
select ok(not has_function_privilege('anon', 'public.activate_lease(uuid, date)', 'execute'), 'anon cannot execute activate_lease');
select ok(has_function_privilege('authenticated', 'public.activate_lease(uuid, date)', 'execute'), 'authenticated can execute activate_lease');
select ok(not has_function_privilege('authenticated', 'private.issue_invoices(uuid, date, timestamptz)', 'execute'),
  'a member cannot run issuance with a date of their choosing');

select * from finish();
rollback;
