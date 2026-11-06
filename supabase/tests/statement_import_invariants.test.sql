begin;
\ir _harness.psql

select plan(36);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, is_default) values
  ('00000000-0000-4000-8000-00000000ba0a', :'a', '970436', '0123456789', 'NGUYEN THI DEMO', true),
  ('00000000-0000-4000-8000-00000000ba0c', :'a', '970422', '9876543210', 'NGUYEN THI DEMO', false),
  ('00000000-0000-4000-8000-00000000ba0b', :'b', '970436', '0123456789', 'TRAN VAN DEMO', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a11', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room'),
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room'),
  ('00000000-0000-4000-8000-000000000a13', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Nguyễn Văn An Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a2', :'a', 'individual', 'Trần Thị Bình Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a3', :'a', 'individual', 'Lê Văn Cường Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e001', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
   '00000000-0000-4000-8000-00000000a0a1', '2026-01-25', '2027-06-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e002', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
   '00000000-0000-4000-8000-00000000a0a2', '2026-01-25', '2027-06-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e003', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13',
   '00000000-0000-4000-8000-00000000a0a3', '2026-01-25', '2027-06-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1',
   private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 'active');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, memo_code, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0110', :'a', '00000000-0000-4000-8000-00000000e001', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-001', 'AAAAB2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0210', :'a', '00000000-0000-4000-8000-00000000e002', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-002', 'AAAAC2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0310', :'a', '00000000-0000-4000-8000-00000000e003', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-003', 'AAAAD2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0b10', :'b', '00000000-0000-4000-8000-00000000e0b1', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'B1-202610-001', 'BBBBE2TT', 'issued', '2026-10-01T00:30:00+07:00');
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select i.household_id, i.id, 'rent', l.rent_vnd, l.rent_vnd from public.invoices i join public.leases l on l.id = i.lease_id;

-- A line as the server stored it: the description and bank reference are the caller's.
create function pg_temp.raw(p_index integer, p_on date, p_amount bigint, p_status text, p_invoice uuid, p_description text, p_ref text, p_key text)
returns jsonb language sql as $$
  select jsonb_build_object('row_index', p_index, 'posted_on', p_on, 'amount_vnd', p_amount, 'description', p_description, 'bank_ref', p_ref,
    'fingerprint', md5(p_key) || md5('fp' || p_key), 'status', p_status, 'reason', null, 'invoice_id', p_invoice, 'candidate_invoice_ids', '[]'::jsonb)
$$;
grant execute on function pg_temp.raw(integer, date, bigint, text, uuid, text, text, text) to authenticated;
create function pg_temp.import(p_id text, p_account text, p_rows jsonb) returns uuid language sql as $$
  select public.create_statement_import(('00000000-0000-4000-8000-00000000' || p_id)::uuid, ('00000000-0000-4000-8000-00000000' || p_account)::uuid, 'sao-ke.csv', '{}', '[]', p_rows)
$$;
create function pg_temp.row_id(p_import text, p_index integer) returns uuid language sql as $$
  select id from public.statement_rows where import_id = ('00000000-0000-4000-8000-00000000' || p_import)::uuid and row_index = p_index
$$;
grant execute on function pg_temp.import(text, text, jsonb), pg_temp.row_id(text, integer) to authenticated;

-- What create_statement_import refuses (#266): a memo match whose description does not hold that bill's code.
select tests.act_as('admin.a@test.esta.test');
select throws_ok($$ select pg_temp.import('c1a0', 'ba0a', jsonb_build_array(
    pg_temp.raw(1, '2026-10-02', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0110', 'ESTA AAAAC2TT', 'FTX1', 'x1'))) $$,
  '22023', 'ESTA_STATEMENT_ROWS', 'a memo match whose description holds another bill''s code is refused');
select throws_ok($$ select pg_temp.import('c1a0', 'ba0a', jsonb_build_array(
    pg_temp.raw(1, '2026-10-02', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0110', 'chuyen tien thue phong', 'FTX1', 'x1'))) $$,
  '22023', 'ESTA_STATEMENT_ROWS', 'a memo match whose description holds no code is refused');
select throws_ok($$ select pg_temp.import('c1a0', 'ba0a', jsonb_build_array(
    pg_temp.raw(1, '2026-10-02', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0b10', 'ESTA BBBBE2TT', 'FTX1', 'x1'))) $$,
  '22023', 'ESTA_STATEMENT_ROWS', 'a memo match naming another household''s bill is refused');
select lives_ok($$ select pg_temp.import('c1a0', 'ba0a', jsonb_build_array(
    pg_temp.raw(1, '2026-09-20', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0110', 'Chuyen khoan e s t a AAAAB2TT cam on', 'FT100', 'a1'),
    pg_temp.raw(2, '2026-10-03', 1000000, 'memo_match', '00000000-0000-4000-8000-0000000f0210', 'ESTA AAAAC2TT', 'FT200', 'a2'),
    pg_temp.raw(3, '2026-10-04', 1000000, 'suggested', '00000000-0000-4000-8000-0000000f0310', 'Tran Van C', 'FT300', 'a3'))) $$,
  'a description holding ESTA and the bill''s code, however the bank spaces it, is stored');

-- A postable line the account already holds under the same reference and amount is left out, even under another
-- fingerprint: the second of two previews of one statement read under other columns.
select lives_ok($$ select pg_temp.import('c1a1', 'ba0a', jsonb_build_array(
    pg_temp.raw(1, '2026-09-20', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0110', 'ESTA AAAAB2TT', 'FT100', 'b1'),
    pg_temp.raw(2, '2026-10-03', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0210', 'ESTA AAAAC2TT', 'FT201', 'b2'))) $$,
  'the same transfer read under other columns is accepted');
select results_eq($$ select row_index from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c1a1' order by row_index $$,
  $$ values (2) $$, 'but only the line with a new reference is stored');
select lives_ok($$ select pg_temp.import('c1a2', 'ba0a', jsonb_build_array(
    pg_temp.raw(1, '2026-10-04', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0110', 'ESTA AAAAB2TT', 'FT100', 'c1'))) $$,
  'the same reference 14 days later is accepted');
select is((select count(*)::integer from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c1a2'), 0,
  'and is the same transfer re-dated, so it is left out');
select lives_ok($$ select pg_temp.import('c1a3', 'ba0a', jsonb_build_array(
    pg_temp.raw(1, '2026-10-05', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0110', 'ESTA AAAAB2TT', 'FT100', 'd1'),
    pg_temp.raw(2, '2026-09-20', 2400000, 'memo_match', '00000000-0000-4000-8000-0000000f0110', 'ESTA AAAAB2TT', 'FT100', 'd2'))) $$,
  'the same reference 15 days later, or with another amount, is accepted');
select is((select count(*)::integer from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c1a3'), 2,
  'and both lines are stored');
select lives_ok($$ select pg_temp.import('c1a4', 'ba0c', jsonb_build_array(
    pg_temp.raw(1, '2026-09-20', 2500000, 'suggested', '00000000-0000-4000-8000-0000000f0110', 'Nguyen Van An', 'FT100', 'e1'))) $$,
  'another account may hold the same reference and amount');
select is((select count(*)::integer from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c1a4'), 1, 'and stores the line');
select lives_ok($$ select pg_temp.import('c1a5', 'ba0a', jsonb_build_array(
    pg_temp.raw(1, '2026-10-02', 2500000, 'unmatched', null, 'Nguyen Van An', '', 'f1'),
    pg_temp.raw(2, '2026-10-02', 2500000, 'unmatched', null, 'Nguyen Van An', '', 'f2'))) $$,
  'two lines without a reference are never the same transfer by reference');
select is((select count(*)::integer from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c1a5'), 2, 'so both are stored');

-- The account's row is locked while an import is created, so two previews take turns.
select ok(
  (select prosrc ~ 'bank_accounts b[\s\S]*for update' from pg_proc where oid = 'public.create_statement_import(uuid, uuid, text, jsonb, jsonb, jsonb)'::regprocedure),
  'create_statement_import locks the receiving account''s row before it reads what the account holds');

-- A hand transfer into another account is not a line's candidate.
select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0210', 2500000, 1000000, 'bank_transfer', '2026-10-03',
  '00000000-0000-4000-8000-00000000cc01', null, '00000000-0000-4000-8000-00000000ba0c') $$, 'Mẹ records Phòng 2''s transfer into the second account');
select lives_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0310', 2500000, 1000000, 'bank_transfer', '2026-10-04',
  '00000000-0000-4000-8000-00000000cc02') $$, 'and Phòng 3''s transfer without naming an account');
select tests.act_as('admin.a@test.esta.test');
select results_eq($$ select l.row_index, l.state from public.statement_import_lines('00000000-0000-4000-8000-00000000c1a0') l order by l.row_index $$,
  $$ values (1, 'memo_match'), (2, 'memo_match'), (3, 'held') $$,
  'a line into the first account is not held by a transfer recorded into the second, and is by one with no account');
select throws_ok($$ select public.link_statement_line(pg_temp.row_id('c1a0', 2), (select id from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000cc01')) $$,
  '55000', 'ESTA_STATEMENT_LINE_NOT_LINKABLE', 'and it cannot be linked to it');

-- Undo: Ghi sổ, then Hoàn tác (#255).
create function pg_temp.owed(p_number text) returns bigint language sql as $$ select outstanding_vnd from public.invoice_balances where number = p_number $$;
grant execute on function pg_temp.owed(text) to authenticated;
select results_eq($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c1a0', '{}') $$, $$ values (2, 0) $$, 'Ghi sổ posts the two memo matches');
select results_eq($$ select pg_temp.owed('DIAN-202610-001'), pg_temp.owed('DIAN-202610-002') $$, $$ values (0::bigint, 500000::bigint) $$, 'Phòng 1''s bill is paid and Phòng 2''s owes what the two transfers left');
select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select public.undo_statement_import('00000000-0000-4000-8000-00000000c1a0') $$,
  'P0002', 'ESTA_IMPORT_NOT_FOUND', 'a member who is not an admin cannot undo an import');
select tests.act_as('admin.b@test.esta.test');
select throws_ok($$ select public.undo_statement_import('00000000-0000-4000-8000-00000000c1a0') $$,
  'P0002', 'ESTA_IMPORT_NOT_FOUND', 'an admin of another household cannot undo it');
select tests.act_as('admin.a@test.esta.test');
select throws_ok($$ select public.undo_statement_import('00000000-0000-4000-8000-00000000c1a0', array['00000000-0000-4000-8000-00000000dead']::uuid[]) $$,
  'P0002', 'ESTA_STATEMENT_LINE_NOT_FOUND', 'a line of no such import cannot be named');
select is(public.undo_statement_import('00000000-0000-4000-8000-00000000c1a0', array[pg_temp.row_id('c1a0', 1)]), 1, 'undoing one line unposts one line');
select results_eq($$ select pg_temp.owed('DIAN-202610-001'), pg_temp.owed('DIAN-202610-002') $$, $$ values (2500000::bigint, 500000::bigint) $$,
  'its bill owes again and the other line''s bill stays as it was');
select results_eq($$ select status from public.statement_imports where id = '00000000-0000-4000-8000-00000000c1a0' $$, $$ values ('committed') $$,
  'the import stays committed while a line is posted');
select is(public.undo_statement_import('00000000-0000-4000-8000-00000000c1a0', array[pg_temp.row_id('c1a0', 1)]), 0, 'undoing it again changes nothing');
select is((select count(*)::integer from public.payment_allocations a join public.payments p on p.id = a.payment_id where p.source = 'statement_import'), 1,
  'the removed payment took its allocation with it');
select results_eq($$ select table_name, action from public.audit_log where table_name = 'payments' and action = 'delete' $$,
  $$ values ('payments', 'delete') $$, 'the audit log keeps the payment''s delete');
select is(public.undo_statement_import('00000000-0000-4000-8000-00000000c1a0'), 1, 'undoing the import unposts its other line');
select results_eq($$ select status, committed_at is null from public.statement_imports where id = '00000000-0000-4000-8000-00000000c1a0' $$,
  $$ values ('parsed', true) $$, 'with no line posted the import reads parsed again');
select results_eq($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c1a0', '{}') $$, $$ values (2, 0) $$,
  'and Ghi sổ can post it again');

-- A hand transfer linked to a line is only unlinked, never deleted.
select lives_ok($$ select public.link_statement_line(pg_temp.row_id('c1a0', 3), (select id from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000cc02')) $$,
  'Phòng 3''s hand transfer is linked to its line');
select is(public.undo_statement_import('00000000-0000-4000-8000-00000000c1a0', array[pg_temp.row_id('c1a0', 3)]), 1, 'undoing that line unlinks it');
select results_eq($$ select count(*)::integer, count(statement_row_id)::integer from public.payments where idempotency_key = '00000000-0000-4000-8000-00000000cc02' $$,
  $$ values (1, 0) $$, 'the payment Mẹ recorded is still there, and no line holds it');

select * from finish();
rollback;
