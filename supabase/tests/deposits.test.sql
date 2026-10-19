begin;
\ir _harness.psql

select plan(50);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a17', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 7', 'room'),
  ('00000000-0000-4000-8000-000000000a18', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 8', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a7', :'a', 'individual', 'Bùi Văn Hùng Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B', array['tenant']);
-- Phòng 7 ended on 2026-09-15 owing 1.300.000 of its last month; Phòng 8 is a draft; b's lease is another household's.
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, deposit_vnd, status) values
  ('00000000-0000-4000-8000-00000000e007', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a17',
   '00000000-0000-4000-8000-00000000a0a7', '2025-09-16', '2026-09-15', 2800000, 2800000, 'ended'),
  ('00000000-0000-4000-8000-00000000e008', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a18',
   '00000000-0000-4000-8000-00000000a0a7', '2026-11-01', null, 2800000, 2800000, 'draft'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1',
   private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 9000000, 'active');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0708', :'a', '00000000-0000-4000-8000-00000000e007', '2026-08-16', '2026-09-15', '2026-08-16', '2026-08-16', 'DIAN-202608-007', 'issued', '2026-08-16T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0b10', :'b', '00000000-0000-4000-8000-00000000e0b1', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'B1-202610-001', 'issued', '2026-10-01T00:30:00+07:00');
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000f0708', 'rent', 2800000, 2800000),
  (:'b', '00000000-0000-4000-8000-0000000f0b10', 'rent', 9000000, 9000000);
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c0708', :'a', '00000000-0000-4000-8000-00000000a0a7', 1500000, '2026-08-16', 'cash');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000c0708', '00000000-0000-4000-8000-0000000f0708', 1500000);
insert into public.deposit_entries (id, household_id, lease_id, kind, amount_vnd, on_date) values
  ('00000000-0000-4000-8000-0000000d0701', :'a', '00000000-0000-4000-8000-00000000e007', 'received', 2800000, '2025-09-16'),
  ('00000000-0000-4000-8000-0000000d0b01', :'b', '00000000-0000-4000-8000-00000000e0b1', 'received', 9000000, '2026-01-01');

-- Refuses one deposit amount, so the next apply fails after its payment and allocation are written.
create function pg_temp.refuse_entry_of_1234() returns trigger language plpgsql as $$
begin
  if new.amount_vnd = 1234 then raise exception 'test refusal' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger refuse_entry_of_1234 before insert on public.deposit_entries
  for each row execute function pg_temp.refuse_entry_of_1234();

\set phong7 '''00000000-0000-4000-8000-00000000e007'''

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.deposit_entries', :'a', true);
select tests.sees_household('public.deposit_entries', :'b', false);
select results_eq(
  $$ select held_vnd from public.lease_deposits where lease_id = '00000000-0000-4000-8000-00000000e007' $$,
  $$ values (2800000::bigint) $$,
  'a viewer reads what Phòng 7 holds (LSE-9)');
select is_empty($$ select 1 from public.lease_deposits where household_id = '$$ || :'b' || $$' $$, 'and nothing of the other household');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'refunded', 100000, '2026-10-07', '00000000-0000-4000-8000-00000000d001') $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'a viewer records no deposit entry');

select tests.act_as('member.a@test.esta.test');
select results_eq(
  $$ select held_vnd from public.lease_deposits where lease_id = '00000000-0000-4000-8000-00000000e008' $$,
  $$ values (0::bigint) $$,
  'a lease with no entries holds nothing');

-- Apply: the last invoice owes 1.300.000.
select throws_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000f0708', 1300001, '2026-10-07', '00000000-0000-4000-8000-00000000d002') $$,
  '23514', 'ESTA_DEPOSIT_EXCEEDS_OUTSTANDING', 'applying more than the invoice still owes is refused');
select throws_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000f0708', 1234, '2026-10-07', '00000000-0000-4000-8000-00000000d003') $$,
  '23514', 'test refusal', 'an applied entry that fails fails the whole call');
select is_empty($$ select 1 from public.payments where method = 'deposit' $$, 'and leaves no payment behind');
select is_empty($$ select 1 from public.payment_allocations where amount_vnd = 1234 $$, 'nor its allocation');
select throws_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000f0b10', 100000, '2026-10-07', '00000000-0000-4000-8000-00000000d004') $$,
  'P0002', 'ESTA_INVOICE_NOT_FOUND', 'a deposit pays only an issued invoice of its own lease');
select throws_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e0b1', '00000000-0000-4000-8000-0000000f0b10', 100000, '2026-10-07', '00000000-0000-4000-8000-00000000d005') $$,
  'P0002', 'ESTA_LEASE_NOT_FOUND', 'another household''s lease takes no entry');
select throws_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000f0708', 1300000, '2026-10-08', '00000000-0000-4000-8000-00000000d006') $$,
  '22023', 'ESTA_DEPOSIT_DATE_AFTER_TODAY', 'an entry cannot be dated after the database clock''s day');

select lives_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000f0708', 1300000, '2026-10-07', '00000000-0000-4000-8000-00000000d007') $$,
  'the held deposit pays the rest of the last invoice');
select results_eq(
  $$ select p.amount_vnd, p.method, p.source, p.payer_party_id, p.received_on, a.invoice_id, a.amount_vnd
     from public.deposit_entries e join public.payments p on p.id = e.payment_id join public.payment_allocations a on a.payment_id = p.id
     where e.idempotency_key = '00000000-0000-4000-8000-00000000d007' and e.kind = 'applied' $$,
  $$ values (1300000::bigint, 'deposit', 'deposit_application', '00000000-0000-4000-8000-00000000a0a7'::uuid, date '2026-10-07',
             '00000000-0000-4000-8000-0000000f0708'::uuid, 1300000::bigint) $$,
  'it writes a deposit payment from the tenant, its allocation to the invoice and the applied entry linked to it (LSE-7)');
select results_eq(
  $$ select outstanding_vnd, payment_status from public.invoice_balances where id = '00000000-0000-4000-8000-0000000f0708' $$,
  $$ values (0::bigint, 'paid') $$,
  'the last invoice reads paid');
select results_eq(
  $$ select held_vnd from public.lease_deposits where lease_id = '00000000-0000-4000-8000-00000000e007' $$,
  $$ values (1500000::bigint) $$,
  'and Phòng 7 holds 1.500.000');
select is(
  public.apply_deposit('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000f0708', 999, '2026-10-01', '00000000-0000-4000-8000-00000000d007'),
  (select id from public.deposit_entries where idempotency_key = '00000000-0000-4000-8000-00000000d007'),
  'a repeated key returns the entry it wrote, whatever else the retry sends (SPEC §7.4)');
select is((select count(*)::integer from public.payments where method = 'deposit'), 1, 'and writes nothing');
select throws_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000f0708', 1, '2026-10-07', '00000000-0000-4000-8000-00000000d008') $$,
  '23514', 'ESTA_DEPOSIT_EXCEEDS_OUTSTANDING', 'a paid invoice takes no more of the deposit');

-- Deduct and refund.
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'deduction', 300000, '2026-10-07', '00000000-0000-4000-8000-00000000d009') $$,
  '22023', 'ESTA_DEPOSIT_NOTE_REQUIRED', 'a deduction says what it paid for');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'deduction', 300000, '2026-10-07', '00000000-0000-4000-8000-00000000d009', '   ') $$,
  '22023', 'ESTA_DEPOSIT_NOTE_REQUIRED', 'a blank note is no note');
select lives_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'deduction', 300000, '2026-10-07', '00000000-0000-4000-8000-00000000d009', '  Sơn lại tường  ') $$,
  'a deduction with its reason is recorded');
select results_eq(
  $$ select kind, amount_vnd, note, payment_id from public.deposit_entries where idempotency_key = '00000000-0000-4000-8000-00000000d009' $$,
  $$ values ('deduction', 300000::bigint, 'Sơn lại tường', null::uuid) $$,
  'with its note trimmed and no payment');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'refunded', 1200001, '2026-10-07', '00000000-0000-4000-8000-00000000d010') $$,
  '23514', 'ESTA_DEPOSIT_EXCEEDS_HELD', 'refunding more than is held is refused');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'deduction', 1200001, '2026-10-07', '00000000-0000-4000-8000-00000000d011', 'Quá số giữ') $$,
  '23514', 'ESTA_DEPOSIT_EXCEEDS_HELD', 'deducting more than is held is refused');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'refunded', 100000, '2025-09-15', '00000000-0000-4000-8000-00000000d012') $$,
  '23514', 'ESTA_DEPOSIT_EXCEEDS_HELD', 'a refund dated before the deposit arrived is refused, though the total would stay above zero');
select is_empty(
  $$ select 1 from public.deposit_entries where idempotency_key in ('00000000-0000-4000-8000-00000000d010', '00000000-0000-4000-8000-00000000d011', '00000000-0000-4000-8000-00000000d012') $$,
  'the refused entries leave nothing behind');
select throws_ok(
  $$ select public.apply_deposit('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-0000000f0708', 1, '2026-10-07', '00000000-0000-4000-8000-00000000d013') $$,
  '23514', 'ESTA_DEPOSIT_EXCEEDS_OUTSTANDING', 'the paid invoice still refuses');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'applied', 100000, '2026-10-07', '00000000-0000-4000-8000-00000000d014') $$,
  '22023', 'ESTA_DEPOSIT_KIND', 'an applied entry is written only with its payment');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'refunded', 0, '2026-10-07', '00000000-0000-4000-8000-00000000d015') $$,
  '22023', 'ESTA_DEPOSIT_AMOUNT', 'an entry is positive');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'refunded', 100000, '2026-10-07', null) $$,
  '22023', 'ESTA_DEPOSIT_KEY_MISSING', 'every entry carries its idempotency key');
select throws_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e008', 'received', 2800000, '2026-10-07', '00000000-0000-4000-8000-00000000d016') $$,
  '55000', 'ESTA_LEASE_NOT_ACTIVE', 'a draft lease takes no entry until it is activated');
select lives_ok(
  $$ select public.record_deposit_entry('00000000-0000-4000-8000-00000000e007', 'refunded', 1200000, '2026-10-07', '00000000-0000-4000-8000-00000000d017') $$,
  'the rest is refunded');
select results_eq(
  $$ select held_vnd from public.lease_deposits where lease_id = '00000000-0000-4000-8000-00000000e007' $$,
  $$ values (0::bigint) $$,
  'Phòng 7 holds nothing');
select results_eq(
  $$ select kind, amount_vnd from public.deposit_entries where lease_id = '00000000-0000-4000-8000-00000000e007' order by on_date, created_at, kind $$,
  $$ values ('received', 2800000::bigint), ('applied', 1300000::bigint), ('deduction', 300000::bigint), ('refunded', 1200000::bigint) $$,
  'the ledger reads received, applied, deducted and refunded');
select results_eq(
  format($$ select action, actor_id from public.audit_log where table_name = 'deposit_entries' and row_id = (select id from public.deposit_entries where idempotency_key = %L) $$,
    '00000000-0000-4000-8000-00000000d017'),
  format($$ values ('insert', %L) $$, tests.user_id('member.a@test.esta.test')),
  'the audit log names the member who refunded');
select results_eq(
  $$ select created_by from public.deposit_entries where idempotency_key = '00000000-0000-4000-8000-00000000d017' $$,
  format($$ values (%L::uuid) $$, tests.user_id('member.a@test.esta.test')),
  'and so does the entry');

-- A member writes only through the functions.
select throws_ok(
  format($$ insert into public.deposit_entries (household_id, lease_id, kind, amount_vnd, on_date) values (%L, %L, 'received', 1000000, '2026-10-07') $$, :'a', :phong7),
  '42501', null, 'a member cannot insert an entry directly');
select throws_ok(
  $$ update public.deposit_entries set amount_vnd = 1 where lease_id = '00000000-0000-4000-8000-00000000e007' $$,
  '42501', null, 'nor change one');
select throws_ok(
  $$ delete from public.deposit_entries where lease_id = '00000000-0000-4000-8000-00000000e007' $$,
  '42501', null, 'nor delete one');

select tests.clear_request();
reset role;
select throws_ok(
  format($$ insert into public.deposit_entries (household_id, lease_id, kind, amount_vnd, on_date) values (%L, %L, 'applied', 1000, '2026-10-07') $$, :'a', :phong7),
  '23514', null, 'an applied entry without its payment is refused by the table');
select throws_ok(
  format($$ insert into public.deposit_entries (household_id, lease_id, kind, amount_vnd, on_date, payment_id) values (%L, %L, 'refunded', 1000, '2026-10-07', '00000000-0000-4000-8000-0000000c0708') $$, :'a', :phong7),
  '23514', null, 'and so is a refund that names a payment');
select throws_ok(
  format($$ insert into public.deposit_entries (household_id, lease_id, kind, amount_vnd, on_date) values (%L, %L, 'deduction', 1000, '2026-10-07') $$, :'a', :phong7),
  '23514', null, 'and a deduction without a note');
select results_eq(
  $$ select held_vnd from public.lease_deposits where lease_id = '00000000-0000-4000-8000-00000000e0b1' $$,
  $$ values (9000000::bigint) $$,
  'household b''s deposit is untouched');
select ok(
  not has_function_privilege('anon', 'public.record_deposit_entry(uuid, text, bigint, date, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.apply_deposit(uuid, uuid, bigint, date, uuid, text)', 'execute')
    and not has_table_privilege('anon', 'public.lease_deposits', 'select'),
  'anon cannot execute either function or read held deposits');
select ok(
  has_function_privilege('authenticated', 'public.record_deposit_entry(uuid, text, bigint, date, uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.apply_deposit(uuid, uuid, bigint, date, uuid, text)', 'execute'),
  'authenticated can execute both');
select ok(
  not has_table_privilege('authenticated', 'public.deposit_entries', 'INSERT')
    and not has_table_privilege('authenticated', 'public.deposit_entries', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.deposit_entries', 'DELETE'),
  'members hold no write grant on deposit_entries');
select ok(
  (select bool_and(p.prosecdef) from pg_proc p where p.oid in (
    'public.record_deposit_entry(uuid, text, bigint, date, uuid, text)'::regprocedure, 'public.apply_deposit(uuid, uuid, bigint, date, uuid, text)'::regprocedure)),
  'both run as security definer');
select ok(
  not exists (
    select 1 from pg_proc p where p.oid in ('private.deposit_low_point(uuid)'::regprocedure, 'private.deposit_entry_seen(public.leases, bigint, date, uuid)'::regprocedure,
      'private.refuse_deposit_overdraw(uuid)'::regprocedure)
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  'the private helpers are not callable by members or anon');

select * from finish();
rollback;
