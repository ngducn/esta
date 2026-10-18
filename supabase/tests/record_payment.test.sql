begin;
\ir _harness.psql

select plan(36);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room'),
  ('00000000-0000-4000-8000-000000000a16', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 6', 'room'),
  ('00000000-0000-4000-8000-000000000a17', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 7', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a5', :'a', 'individual', 'Hoàng Văn Em Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a6', :'a', 'individual', 'Đặng Thị Giang Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a7', :'a', 'individual', 'Bùi Văn Hùng Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e005', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a15',
   '00000000-0000-4000-8000-00000000a0a5', '2026-02-25', '2027-06-24', 2800000, 'active'),
  ('00000000-0000-4000-8000-00000000e006', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a16',
   '00000000-0000-4000-8000-00000000a0a6', '2026-05-25', '2027-06-24', 2800000, 'active'),
  ('00000000-0000-4000-8000-00000000e007', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a17',
   '00000000-0000-4000-8000-00000000a0a7', '2025-09-25', '2027-06-24', 2800000, 'active'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1',
   private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 'active');

-- Phòng 5 owes September and October, with November still a draft; Phòng 6 owes October; Phòng 7 owes nothing.
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0509', :'a', '00000000-0000-4000-8000-00000000e005', '2026-09-25', '2026-10-24', '2026-09-25', '2026-09-25', 'DIAN-202609-005', 'issued', '2026-09-25T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0510', :'a', '00000000-0000-4000-8000-00000000e005', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-005', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0511', :'a', '00000000-0000-4000-8000-00000000e005', '2026-11-25', '2026-12-24', '2026-11-25', '2026-11-25', 'DIAN-202611-005', 'draft', null),
  ('00000000-0000-4000-8000-0000000f0610', :'a', '00000000-0000-4000-8000-00000000e006', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-006', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0709', :'a', '00000000-0000-4000-8000-00000000e007', '2026-09-25', '2026-10-24', '2026-09-25', '2026-09-25', 'DIAN-202609-007', 'issued', '2026-09-25T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0b10', :'b', '00000000-0000-4000-8000-00000000e0b1', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'B1-202610-001', 'issued', '2026-10-01T00:30:00+07:00');
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select household_id, id, 'rent', 2800000, 2800000 from public.invoices;
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c0709', :'a', '00000000-0000-4000-8000-00000000a0a7', 2800000, '2026-09-25', 'cash'),
  ('00000000-0000-4000-8000-0000000c0b10', :'b', '00000000-0000-4000-8000-00000000b0b1', 1000000, '2026-10-02', 'bank_transfer');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000c0709', '00000000-0000-4000-8000-0000000f0709', 2800000),
  (:'b', '00000000-0000-4000-8000-0000000c0b10', '00000000-0000-4000-8000-0000000f0b10', 1000000);

-- Refuses one allocation amount, so the next call fails after its payment row is written.
create function pg_temp.refuse_allocation_of_1234() returns trigger language plpgsql as $$
begin
  if new.amount_vnd = 1234 then raise exception 'test refusal' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger refuse_allocation_of_1234 before insert on public.payment_allocations
  for each row execute function pg_temp.refuse_allocation_of_1234();

create temporary view allocations as
  select p.idempotency_key, i.number, a.amount_vnd
  from public.payments p join public.payment_allocations a on a.payment_id = p.id join public.invoices i on i.id = a.invoice_id;
grant select on allocations to authenticated;

select tests.act_as('member.a@test.esta.test');

select results_eq(
  $$ select amount_vnd, allocated_vnd from public.record_payment('00000000-0000-4000-8000-0000000f0509', 1000000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c001') $$,
  $$ values (1000000::bigint, 1000000::bigint) $$,
  'a partial payment settles part of the oldest invoice (LSE-7)');
select results_eq(
  $$ select number, amount_vnd from allocations where idempotency_key = '00000000-0000-4000-8000-00000000c001' $$,
  $$ values ('DIAN-202609-005', 1000000::bigint) $$,
  'the partial payment goes to September, the oldest due');
select results_eq(
  $$ select amount_vnd, allocated_vnd from public.record_payment('00000000-0000-4000-8000-0000000f0510', 7000000, 'bank_transfer', '2026-10-06', '00000000-0000-4000-8000-00000000c002') $$,
  $$ values (7000000::bigint, 4600000::bigint) $$,
  'an overpayment settles everything owed and leaves 2.400.000 as credit');
select results_eq(
  $$ select number, amount_vnd from allocations where idempotency_key = '00000000-0000-4000-8000-00000000c002' order by number $$,
  $$ values ('DIAN-202609-005', 1800000::bigint), ('DIAN-202610-005', 2800000::bigint) $$,
  'oldest due first: the rest of September, then October, never the November draft');
select results_eq(
  $$ select payer_party_id, method, received_on, source, created_by from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000c002' $$,
  format($$ values ('00000000-0000-4000-8000-00000000a0a5'::uuid, 'bank_transfer', date '2026-10-06', 'manual', %L::uuid) $$, tests.user_id('member.a@test.esta.test')),
  'the payer is the lease''s tenant and the recorder is the member, never a caller''s choice');

select results_eq(
  $$ select id, amount_vnd, allocated_vnd from public.record_payment('00000000-0000-4000-8000-0000000f0510', 9999, 'cash', '2026-10-01', '00000000-0000-4000-8000-00000000c002') $$,
  $$ select id, amount_vnd, 4600000::bigint from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000c002' $$,
  'a repeated key returns the payment it recorded (SPEC §7.4)');
select is(
  (select count(*)::integer from public.payments where household_id = :'a'),
  3,
  'and writes nothing');

select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0509', 100000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c003') $$,
  '23514', 'ESTA_NOTHING_OWED', 'a lease that owes nothing takes no new payment');

select lives_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 2800000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c004',
       array['00000000-0000-4000-8000-0000000f0610']::uuid[]) $$,
  'a manual choice of the lease''s own open invoice is accepted');
select results_eq(
  $$ select number, amount_vnd from allocations where idempotency_key = '00000000-0000-4000-8000-00000000c004' $$,
  $$ values ('DIAN-202610-006', 2800000::bigint) $$,
  'and settles it');

-- Phòng 6 owes October again for the refusals below.
reset role;
delete from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000c004';
select tests.act_as('member.a@test.esta.test');

select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0b10', 1000000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c010') $$,
  'P0002', 'ESTA_INVOICE_NOT_FOUND', 'another household''s invoice takes no payment from this member');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0511', 1000000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c011') $$,
  'P0002', 'ESTA_INVOICE_NOT_FOUND', 'a draft invoice takes no payment');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 1000000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c012',
       array['00000000-0000-4000-8000-0000000f0b10']::uuid[]) $$,
  '23514', 'ESTA_ALLOCATION_CHOICE', 'a manual choice cannot name another household''s invoice');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 1000000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c013',
       array['00000000-0000-4000-8000-0000000f0709']::uuid[]) $$,
  '23514', 'ESTA_ALLOCATION_CHOICE', 'a manual choice cannot name another lease''s invoice');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 1000000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c014', array[]::uuid[]) $$,
  '23514', 'ESTA_ALLOCATION_CHOICE', 'a manual choice names at least one invoice');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 1000000, 'cash', '2026-10-08', '00000000-0000-4000-8000-00000000c015') $$,
  '22023', 'ESTA_PAYMENT_DATE_AFTER_TODAY', 'a payment cannot be dated after the database clock''s day');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 1000000, 'deposit', '2026-10-07', '00000000-0000-4000-8000-00000000c016') $$,
  '22023', 'ESTA_PAYMENT_METHOD', 'only cash and transfer are recorded here; deposits apply through their own path');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 0, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c017') $$,
  '23514', null, 'a payment is positive');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 1000000, 'cash', '2026-10-07', null) $$,
  '22023', 'ESTA_PAYMENT_KEY_MISSING', 'every payment carries its idempotency key');

select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 1234, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c018') $$,
  '23514', 'test refusal', 'an allocation that fails fails the whole call');
select is_empty(
  $$ select 1 from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000c018' $$,
  'and leaves no payment behind');
select ok(
  not exists (select 1 from public.payments p where p.amount_vnd < (select coalesce(sum(a.amount_vnd), 0) from public.payment_allocations a where a.payment_id = p.id)),
  'no payment allocates more than it brought');

select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  $$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 1000000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000c020') $$,
  'P0002', 'ESTA_INVOICE_NOT_FOUND', 'a viewer records no payment');

select tests.act_as('admin.a@test.esta.test');
select throws_ok(
  $$ select public.undo_payment((select id from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000c001')) $$,
  '42501', 'ESTA_PAYMENT_NOT_UNDOABLE', 'only the member who recorded a payment undoes it');
select throws_ok(
  $$ select public.undo_payment('00000000-0000-4000-8000-0000000c0709') $$,
  '42501', 'ESTA_PAYMENT_NOT_UNDOABLE', 'a payment nobody recorded through the sheet cannot be undone here');

select tests.act_as('member.a@test.esta.test');
select id as undone from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000c002' \gset
select lives_ok(format($$ select public.undo_payment(%L) $$, :'undone'), 'the recorder undoes the payment');
select is_empty(format($$ select 1 from public.payments where id = %L $$, :'undone'), 'the payment is gone');
select is_empty(format($$ select 1 from public.payment_allocations where payment_id = %L $$, :'undone'), 'and its allocations with it');
select lives_ok(format($$ select public.undo_payment(%L) $$, :'undone'), 'undoing it again changes nothing');
select results_eq(
  format($$ select table_name, action from public.audit_log where row_id = %L or (table_name = 'payment_allocations' and coalesce(diff -> 'payment_id' ->> 'new', diff -> 'payment_id' ->> 'old') = %L) order by table_name, action $$, :'undone', :'undone'),
  $$ values ('payment_allocations', 'delete'), ('payment_allocations', 'delete'), ('payment_allocations', 'insert'), ('payment_allocations', 'insert'),
            ('payments', 'delete'), ('payments', 'insert') $$,
  'the audit log keeps the insert and the delete of the payment and both allocations');
select lives_ok($$ select public.undo_payment('00000000-0000-4000-8000-0000000c0b10') $$, 'another household''s payment id is answered like one already gone');

reset role;
update public.payments set created_at = now() - interval '3 minutes' where idempotency_key = '00000000-0000-4000-8000-00000000c001';
select tests.act_as('member.a@test.esta.test');
select throws_ok(
  $$ select public.undo_payment((select id from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000c001')) $$,
  '42501', 'ESTA_PAYMENT_NOT_UNDOABLE', 'the undo window closes');

select tests.clear_request();
reset role;
select is((select count(*)::integer from public.payments where id = '00000000-0000-4000-8000-0000000c0b10'), 1, 'household b''s payment is untouched');
select ok(
  not has_function_privilege('anon', 'public.record_payment(uuid, bigint, text, date, uuid, uuid[])', 'execute')
    and not has_function_privilege('anon', 'public.undo_payment(uuid)', 'execute'),
  'anon cannot execute record_payment or undo_payment');
select ok(
  has_function_privilege('authenticated', 'public.record_payment(uuid, bigint, text, date, uuid, uuid[])', 'execute')
    and has_function_privilege('authenticated', 'public.undo_payment(uuid)', 'execute'),
  'authenticated can execute both');
select ok(
  (select bool_and(p.prosecdef) from pg_proc p where p.oid in ('public.record_payment(uuid, bigint, text, date, uuid, uuid[])'::regprocedure, 'public.undo_payment(uuid)'::regprocedure)),
  'both run as security definer, so members still hold no write grant on payments');

select * from finish();
rollback;
