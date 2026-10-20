begin;
\ir _harness.psql

select plan(70);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, is_default) values
  ('00000000-0000-4000-8000-00000000ba0a', :'a', '970436', '0123456789', 'NGUYEN THI DEMO', true),
  ('00000000-0000-4000-8000-00000000ba0b', :'b', '970436', '0123456789', 'TRAN VAN DEMO', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a11', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room'),
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room'),
  ('00000000-0000-4000-8000-000000000a13', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room'),
  ('00000000-0000-4000-8000-000000000a14', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 4', 'room'),
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room'),
  ('00000000-0000-4000-8000-000000000a16', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 6', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Nguyễn Văn An Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a2', :'a', 'individual', 'Trần Thị Bình Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a3', :'a', 'individual', 'Lê Văn Cường Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a4', :'a', 'individual', 'Võ Thị Dung Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a5', :'a', 'individual', 'Hoàng Văn Em Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a6', :'a', 'individual', 'Đặng Thị Giang Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e001', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
   '00000000-0000-4000-8000-00000000a0a1', '2026-01-25', '2027-06-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e002', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
   '00000000-0000-4000-8000-00000000a0a2', '2026-01-25', '2027-06-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e003', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13',
   '00000000-0000-4000-8000-00000000a0a3', '2026-01-25', '2027-06-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e004', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a14',
   '00000000-0000-4000-8000-00000000a0a4', '2026-01-25', '2027-06-24', 2800000, 'active'),
  ('00000000-0000-4000-8000-00000000e005', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a15',
   '00000000-0000-4000-8000-00000000a0a5', '2026-01-25', '2027-06-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e006', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a16',
   '00000000-0000-4000-8000-00000000a0a6', '2026-01-25', '2027-06-24', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1',
   private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 'active');

-- Phòng 1 owes September and October. Phòng 2 owes October, whose bill also carries its meters. Phòng 3 to 6 owe
-- October; Phòng 4's is 2.800.000.
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, memo_code, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0109', :'a', '00000000-0000-4000-8000-00000000e001', '2026-09-25', '2026-10-24', '2026-09-25', '2026-09-25', 'DIAN-202609-001', 'AAAAB9SE', 'issued', '2026-09-25T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0110', :'a', '00000000-0000-4000-8000-00000000e001', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-001', 'AAAAB2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0210', :'a', '00000000-0000-4000-8000-00000000e002', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-002', 'AAAAC2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0310', :'a', '00000000-0000-4000-8000-00000000e003', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-003', 'AAAAD2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0410', :'a', '00000000-0000-4000-8000-00000000e004', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-004', 'AAAAE2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0510', :'a', '00000000-0000-4000-8000-00000000e005', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-005', 'AAAAF2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0610', :'a', '00000000-0000-4000-8000-00000000e006', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'DIAN-202610-006', 'AAAAG2TT', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0b10', :'b', '00000000-0000-4000-8000-00000000e0b1', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'B1-202610-001', 'BBBBE2TT', 'issued', '2026-10-01T00:30:00+07:00');
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select i.household_id, i.id, 'rent', l.rent_vnd, l.rent_vnd from public.invoices i join public.leases l on l.id = i.lease_id;
insert into public.meters (id, household_id, property_id, unit_id, kind, pricing) values
  ('00000000-0000-4000-8000-00000000d021', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12', 'electricity', '{"kind":"flat","unit_price_vnd":3500}'),
  ('00000000-0000-4000-8000-00000000d022', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12', 'water', '{"kind":"flat","unit_price_vnd":18000}');
insert into public.invoice_lines (household_id, invoice_id, kind, meter_id, reading_month, quantity, unit_price_vnd, amount_vnd, description, sort_order) values
  (:'a', '00000000-0000-4000-8000-0000000f0210', 'electricity', '00000000-0000-4000-8000-00000000d021', '2026-09-01', 110, 3500, 385000, 'Tiền điện tháng 9/2026', 1),
  (:'a', '00000000-0000-4000-8000-0000000f0210', 'water', '00000000-0000-4000-8000-00000000d022', '2026-09-01', 6, 18000, 108000, 'Tiền nước tháng 9/2026', 2);

create temporary view posted as
  select r.import_id, r.row_index, p.amount_vnd, p.received_on, p.method, p.source, p.bank_ref, p.bank_account_id, i.number, a.amount_vnd as allocated_vnd
  from public.statement_rows r
  join public.payments p on p.statement_row_id = r.id
  left join public.payment_allocations a on a.payment_id = p.id
  left join public.invoices i on i.id = a.invoice_id;
grant select on posted to authenticated;

-- A row as the server's matchRows stored it, with a fingerprint made from its key.
create function pg_temp.line(p_index integer, p_on date, p_amount bigint, p_status text, p_invoice uuid, p_reason text default null, p_key text default null)
returns jsonb language sql as $$
  select jsonb_build_object('row_index', p_index, 'posted_on', p_on, 'amount_vnd', p_amount, 'description', 'ESTA DEMO ' || p_index,
    'bank_ref', 'FT' || p_index, 'fingerprint', md5(coalesce(p_key, p_index::text)) || md5('fp' || coalesce(p_key, p_index::text)),
    'status', p_status, 'reason', p_reason, 'invoice_id', p_invoice, 'candidate_invoice_ids', '[]'::jsonb)
$$;
grant execute on function pg_temp.line(integer, date, bigint, text, uuid, text, text) to authenticated;

-- Rows 1 to 3 match by memo, row 4 is suggested, row 5 is unmatched, row 6 a debit and row 7 the file's second copy of row 1.
select jsonb_build_array(
  pg_temp.line(1, '2026-10-02', 3000000, 'memo_match', '00000000-0000-4000-8000-0000000f0110'),
  pg_temp.line(2, '2026-10-03', 2993000, 'memo_match', '00000000-0000-4000-8000-0000000f0210'),
  pg_temp.line(3, '2026-10-04', 1000000, 'memo_match', '00000000-0000-4000-8000-0000000f0310'),
  pg_temp.line(4, '2026-10-05', 2500000, 'suggested', '00000000-0000-4000-8000-0000000f0109'),
  pg_temp.line(5, '2026-10-05', 850000, 'unmatched', null),
  pg_temp.line(6, '2026-10-06', -11000, 'ignored', null, 'debit'),
  pg_temp.line(7, '2026-10-02', 3000000, 'ignored', null, 'duplicate', '1')
) as rows \gset

select tests.act_as('member.a@test.esta.test');
select throws_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke.csv', '{}', '[]', %L) $$, :'rows'),
  'P0002', 'ESTA_BANK_ACCOUNT_NOT_FOUND', 'a member who is not an admin cannot import a statement');

select tests.act_as('admin.b@test.esta.test');
select throws_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke.csv', '{}', '[]', %L) $$, :'rows'),
  'P0002', 'ESTA_BANK_ACCOUNT_NOT_FOUND', 'an admin of B cannot import into A''s account');

select tests.act_as('admin.a@test.esta.test');
select throws_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a9', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke.csv', '{}', '[]', %L) $$,
  jsonb_build_array(pg_temp.line(1, '2026-10-08', 3000000, 'memo_match', '00000000-0000-4000-8000-0000000f0110'))),
  '22023', 'ESTA_STATEMENT_ROWS', 'a line dated after the database clock''s date cannot be stored to post');
select throws_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a9', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke.csv', '{}', '[]', %L) $$,
  jsonb_build_array(pg_temp.line(1, '2026-10-02', 3000000, 'posted', '00000000-0000-4000-8000-0000000f0110'))),
  '23514', null, 'a line cannot arrive already posted: only a payment makes a line posted');
select throws_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a9', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke.csv', '{}', '[]', %L) $$,
  jsonb_build_array(pg_temp.line(1, '2026-10-02', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0b10'))),
  '23503', null, 'a line cannot name another household''s bill');
select lives_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke.csv',
  '{"headerRow":0,"header":["Ngày","Số tiền","Nội dung"],"mapping":{"date":0,"description":2,"bankRef":null,"amount":{"kind":"signed","amount":1}}}', '[{"index":8,"field":"amount","reason":"fractional"}]', %L) $$, :'rows'),
  'an admin of A imports the statement into A''s account');
select results_eq($$ select status, count(*)::integer from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a1' group by 1 order by 1 $$,
  $$ values ('ignored', 2), ('memo_match', 3), ('suggested', 1), ('unmatched', 1) $$, 'every line is stored with its match');
select results_eq($$ select status, file_name, rejected from public.statement_imports where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  $$ values ('parsed', 'sao-ke.csv', '[{"index":8,"field":"amount","reason":"fractional"}]'::jsonb) $$, 'the import is parsed and keeps the refused line');

-- Reading and writing.
select tests.sees_household('public.statement_imports', :'a', true);
select tests.sees_household('public.statement_rows', :'a', true);
select throws_ok(format($$ insert into public.statement_rows (household_id, import_id, row_index, posted_on, amount_vnd, description, fingerprint, status)
  values (%L, '00000000-0000-4000-8000-00000000c0a1', 99, '2026-10-01', 1, 'x', repeat('a', 64), 'unmatched') $$, :'a'),
  '42501', null, 'an admin cannot add a statement line through the API');
select throws_ok($$ update public.statement_rows set status = 'memo_match' $$, '42501', null, 'an admin cannot change a line through the API');
select throws_ok($$ delete from public.statement_rows $$, '42501', null, 'an admin cannot delete a statement line through the API');
select throws_ok(format($$ insert into public.statement_imports (household_id, bank_account_id, file_name, column_mapping)
  values (%L, '00000000-0000-4000-8000-00000000ba0a', 'x.csv', '{}') $$, :'a'),
  '42501', null, 'an admin cannot add an import through the API');
select throws_ok($$ update public.statement_imports set status = 'committed' $$, '42501', null, 'an admin cannot commit an import through the API');
select throws_ok($$ delete from public.statement_imports $$, '42501', null, 'an admin cannot delete an import through the API');
select tests.act_as('member.a@test.esta.test');
select is_empty($$ select 1 from public.statement_rows $$, 'a member who is not an admin reads no statement line');
select tests.act_as('viewer.a@test.esta.test');
select is_empty($$ select 1 from public.statement_imports $$, 'a viewer reads no statement import');
select tests.act_as('admin.b@test.esta.test');
select tests.sees_household('public.statement_rows', :'a', false);

-- Committing.
select throws_ok($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a1', '{}') $$,
  'P0002', 'ESTA_IMPORT_NOT_FOUND', 'an admin of B cannot commit A''s import');
select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a1', '{}') $$,
  'P0002', 'ESTA_IMPORT_NOT_FOUND', 'a member who is not an admin cannot commit');
select tests.act_as('viewer.a@test.esta.test');
select throws_ok($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a1', '{}') $$,
  'P0002', 'ESTA_IMPORT_NOT_FOUND', 'a viewer cannot commit');

select tests.act_as('admin.a@test.esta.test');
select results_eq($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a1', '{}') $$,
  $$ values (3, 0) $$, 'committing posts the three memo matches and nothing else (LSE-8)');
select results_eq($$ select row_index, amount_vnd, received_on, method, source, bank_ref, bank_account_id, number, allocated_vnd from posted
     where import_id = '00000000-0000-4000-8000-00000000c0a1' order by row_index, number $$,
  $$ values
    (1, 3000000::bigint, '2026-10-02'::date, 'bank_transfer', 'statement_import', 'FT1', '00000000-0000-4000-8000-00000000ba0a'::uuid, 'DIAN-202609-001', 500000::bigint),
    (1, 3000000::bigint, '2026-10-02'::date, 'bank_transfer', 'statement_import', 'FT1', '00000000-0000-4000-8000-00000000ba0a'::uuid, 'DIAN-202610-001', 2500000::bigint),
    (2, 2993000::bigint, '2026-10-03'::date, 'bank_transfer', 'statement_import', 'FT2', '00000000-0000-4000-8000-00000000ba0a'::uuid, 'DIAN-202610-002', 2993000::bigint),
    (3, 1000000::bigint, '2026-10-04'::date, 'bank_transfer', 'statement_import', 'FT3', '00000000-0000-4000-8000-00000000ba0a'::uuid, 'DIAN-202610-003', 1000000::bigint) $$,
  'each posts a transfer into the import''s account, its own bill first and the rest to the oldest bill still owed');
select results_eq($$ select number, payment_status from public.invoice_balances where number in ('DIAN-202609-001', 'DIAN-202610-001', 'DIAN-202610-002', 'DIAN-202610-003') order by number $$,
  $$ values ('DIAN-202609-001', 'partial'), ('DIAN-202610-001', 'paid'), ('DIAN-202610-002', 'paid'), ('DIAN-202610-003', 'partial') $$,
  'the bill with electricity and water lines is paid in full by the transfer of its whole total');
select results_eq($$ select row_index, state from public.statement_import_lines('00000000-0000-4000-8000-00000000c0a1') where state = 'posted' $$,
  $$ values (1, 'posted'), (2, 'posted'), (3, 'posted') $$, 'a line is posted once its payment holds it');
select results_eq($$ select status, committed_at is not null from public.statement_imports where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  $$ values ('committed', true) $$, 'the import is committed');
select results_eq($$ select row_index, state from public.statement_import_lines('00000000-0000-4000-8000-00000000c0a1') where state <> 'posted' $$,
  $$ values (4, 'suggested'), (5, 'unmatched'), (6, 'ignored'), (7, 'ignored') $$, 'an unconfirmed suggestion, an unmatched line and the ignored lines stay as they were');

select results_eq($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a1', '{}') $$,
  $$ values (0, 0) $$, 'a second commit posts nothing (SPEC §7.4)');
select results_eq(format($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a1', array[%L, %L]::uuid[]) $$,
  (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a1' and row_index = 4),
  (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a1' and row_index = 5)),
  $$ values (1, 0) $$, 'confirming the suggestion posts it, and naming an unmatched line posts nothing');
select results_eq($$ select number, allocated_vnd from posted where import_id = '00000000-0000-4000-8000-00000000c0a1' and row_index = 4 $$,
  $$ values ('DIAN-202609-001', 2000000::bigint) $$,
  'the suggestion pays what its bill still owes, and the rest is the tenant''s credit');
select results_eq(format($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a1', array[%L]::uuid[]) $$,
  (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a1' and row_index = 4)),
  $$ values (0, 0) $$, 'confirming it again posts nothing');
select is((select count(*)::integer from public.payments where source = 'statement_import'), 4, 'four lines posted four payments in all');

-- A file imported again stores nothing new: each line already held keeps its first row and fingerprint.
select lives_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a2', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke.csv', '{}', '[]', %L) $$, :'rows'),
  'the same lines sent again are accepted');
select results_eq($$ select status, count(*)::integer from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a2' group by 1 $$,
  $$ values ('ignored', 1) $$, 'only the in-file repeat, which never takes the unique key, is stored again');
select is_empty($$ select fingerprint from public.statement_rows where reason is distinct from 'duplicate' group by fingerprint having count(*) > 1 $$,
  'no fingerprint is stored twice outside in-file repeats');
select results_eq($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a2', '{}') $$,
  $$ values (0, 0) $$, 'committing the re-import posts nothing');

-- A memo match whose bill was voided or paid since the preview posts nothing and waits for a person.
select tests.clear_request();
select set_config('esta.actor', 'system:test', true);
reset role;
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, memo_code, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0211', :'a', '00000000-0000-4000-8000-00000000e002', '2026-11-25', '2026-12-24', '2026-11-25', '2026-10-05', 'DIAN-202611-002', 'AAAAC2NV', 'issued', '2026-10-05T00:30:00+07:00');
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd) values (:'a', '00000000-0000-4000-8000-0000000f0211', 'rent', 2500000, 2500000);
select tests.act_as('admin.a@test.esta.test');
select lives_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a3', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke-2.csv', '{}', '[]', %L) $$,
  jsonb_build_array(
    pg_temp.line(1, '2026-10-06', 2500000, 'memo_match', '00000000-0000-4000-8000-0000000f0211', null, 'void-1'),
    pg_temp.line(2, '2026-10-06', 500000, 'memo_match', '00000000-0000-4000-8000-0000000f0310', null, 'paid-2'))),
  'a second statement matches November''s bill of Phòng 2 and the rest of Phòng 3''s October');
select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0211', 'Sai số tiền') $$, 'then November''s bill is voided');
select lives_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0310', 1500000, 1500000, 'cash', '2026-10-07', '00000000-0000-4000-8000-00000000cc01') $$,
  'and Mẹ records the rest of Phòng 3''s October in cash');
select tests.act_as('admin.a@test.esta.test');
select results_eq($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a3', '{}') $$,
  $$ values (0, 2) $$, 'neither line posts');
select results_eq($$ select row_index, state, reason, invoice_id from public.statement_import_lines('00000000-0000-4000-8000-00000000c0a3') $$,
  $$ values (1, 'unmatched', 'void', '00000000-0000-4000-8000-0000000f0211'::uuid), (2, 'unmatched', 'paid', '00000000-0000-4000-8000-0000000f0310'::uuid) $$,
  'each is left unmatched, naming the voided or paid bill and why');
select is((select count(*)::integer from public.payments where source = 'statement_import'), 4, 'no payment was posted for them');

-- A memo match on a bill with a transfer recorded by hand that no line holds is held for a person ([app rule]).
-- Phòng 4: Mẹ records 1.000.000 of 2.800.000 by hand. Phòng 5: she records 1.000.000 of 2.500.000 by hand, and the
-- statement holds that transfer and a second 1.000.000. Phòng 6: she records 1.000.000 in cash.
select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0410', 2800000, 1000000, 'bank_transfer', '2026-10-05',
  '00000000-0000-4000-8000-00000000cc04', null, '00000000-0000-4000-8000-00000000ba0a') $$, 'Mẹ records 1.000.000 of Phòng 4 as a transfer');
select lives_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0510', 2500000, 1000000, 'bank_transfer', '2026-10-04',
  '00000000-0000-4000-8000-00000000cc05') $$, 'Mẹ records 1.000.000 of Phòng 5 as a transfer');
select lives_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 2500000, 1000000, 'cash', '2026-10-04',
  '00000000-0000-4000-8000-00000000cc06') $$, 'Mẹ records 1.000.000 of Phòng 6 in cash');
select tests.act_as('admin.a@test.esta.test');
select lives_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a4', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke-3.csv', '{}', '[]', %L) $$,
  jsonb_build_array(
    pg_temp.line(1, '2026-10-05', 1000000, 'memo_match', '00000000-0000-4000-8000-0000000f0410', null, 'hand-4'),
    pg_temp.line(2, '2026-10-04', 1000000, 'memo_match', '00000000-0000-4000-8000-0000000f0510', null, 'hand-5a'),
    pg_temp.line(3, '2026-10-06', 1000000, 'memo_match', '00000000-0000-4000-8000-0000000f0510', null, 'hand-5b'),
    pg_temp.line(4, '2026-10-04', 1000000, 'memo_match', '00000000-0000-4000-8000-0000000f0610', null, 'cash-6'))),
  'a third statement names the Phòng 4, 5 and 6 bills');
select results_eq($$ select row_index, state, reason, hand_received_on, hand_amount_vnd, link_payment_id is not null
  from public.statement_import_lines('00000000-0000-4000-8000-00000000c0a4') $$,
  $$ values (1, 'held', 'recorded_by_hand', '2026-10-05'::date, 1000000::bigint, true), (2, 'held', 'recorded_by_hand', '2026-10-04'::date, 1000000::bigint, true),
            (3, 'held', 'recorded_by_hand', '2026-10-04'::date, 1000000::bigint, true), (4, 'memo_match', null, null::date, null::bigint, false) $$,
  'the preview holds each line on a bill with an unclaimed hand transfer, names it, and leaves the cash one alone');
select results_eq($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a4', '{}') $$,
  $$ values (1, 3) $$, 'Ghi sổ posts only the line beside a cash payment and holds the three others');
select results_eq($$ select number, outstanding_vnd from public.invoice_balances where number in ('DIAN-202610-004', 'DIAN-202610-005', 'DIAN-202610-006') order by number $$,
  $$ values ('DIAN-202610-004', 1800000::bigint), ('DIAN-202610-005', 1500000::bigint), ('DIAN-202610-006', 500000::bigint) $$,
  'Phòng 4 still owes 1.800.000 and Phòng 5 1.500.000, so nothing was recorded twice');

select lives_ok(format($$ select public.link_statement_line(%L) $$, (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a4' and row_index = 2)),
  'Đã ghi tay links Phòng 5''s first line to the transfer Mẹ recorded');
select results_eq($$ select p.source, p.amount_vnd, (select count(*)::integer from public.payment_allocations a where a.invoice_id = '00000000-0000-4000-8000-0000000f0510')
  from public.payments p join public.statement_rows r on r.id = p.statement_row_id
  where r.import_id = '00000000-0000-4000-8000-00000000c0a4' and r.row_index = 2 $$,
  $$ values ('manual', 1000000::bigint, 1) $$, 'the hand payment now holds the line, and no money was added to the bill');
select results_eq($$ select row_index, state, reason from public.statement_import_lines('00000000-0000-4000-8000-00000000c0a4') where row_index in (2, 3) $$,
  $$ values (2, 'posted', 'recorded_by_hand'), (3, 'memo_match', null) $$, 'the linked line reads posted by hand, and the second transfer is no longer held');
select lives_ok(format($$ select public.link_statement_line(%L) $$, (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a4' and row_index = 2)),
  'linking it again changes nothing');
select throws_ok(format($$ select public.link_statement_line(%L) $$, (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a4' and row_index = 3)),
  '55000', 'ESTA_STATEMENT_LINE_NOT_LINKABLE', 'a line that is not held cannot be linked');
select results_eq($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a4', '{}') $$,
  $$ values (1, 0) $$, 'the next Ghi sổ posts Phòng 5''s second transfer');
select is((select outstanding_vnd from public.invoice_balances where number = 'DIAN-202610-005'), 500000::bigint,
  'Phòng 5 shows 2.000.000 received for the 2.000.000 sent, and owes 500.000');
select lives_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a5', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke-3.csv', '{}', '[]', %L) $$,
  jsonb_build_array(pg_temp.line(2, '2026-10-04', 1000000, 'memo_match', '00000000-0000-4000-8000-0000000f0510', null, 'hand-5a'))),
  'the linked line imported again is accepted');
select results_eq($$ select (select count(*)::integer from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a5'),
  (select posted_count from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a5', '{}')) $$,
  $$ values (0, 0) $$, 'and stores and posts nothing, because the linked line is known');

select results_eq(format($$ select * from public.commit_statement_import('00000000-0000-4000-8000-00000000c0a4', array[%L]::uuid[]) $$,
  (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a4' and row_index = 1)),
  $$ values (1, 0) $$, 'confirming the held Phòng 4 line posts it as a new transfer');
select results_eq($$ select outstanding_vnd, (select count(*)::integer from public.payments p join public.payment_allocations a on a.payment_id = p.id
  where a.invoice_id = '00000000-0000-4000-8000-0000000f0410') from public.invoice_balances where number = 'DIAN-202610-004' $$,
  $$ values (800000::bigint, 2) $$, 'Phòng 4 now holds the hand transfer and the posted one');

select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 500000, 200000, 'bank_transfer', '2026-10-06',
  '00000000-0000-4000-8000-00000000cc07') $$, 'Mẹ records 200.000 of Phòng 6 by transfer');
select lives_ok($$ select * from public.record_payment('00000000-0000-4000-8000-0000000f0610', 300000, 200000, 'bank_transfer', '2026-10-06',
  '00000000-0000-4000-8000-00000000cc08') $$, 'and another 200.000');
select tests.act_as('admin.a@test.esta.test');
select lives_ok(format($$ select public.create_statement_import('00000000-0000-4000-8000-00000000c0a6', '00000000-0000-4000-8000-00000000ba0a', 'sao-ke-4.csv', '{}', '[]', %L) $$,
  jsonb_build_array(pg_temp.line(1, '2026-10-06', 200000, 'memo_match', '00000000-0000-4000-8000-0000000f0610', null, 'twin-6'))),
  'a statement names one 200.000 transfer to Phòng 6');
select results_eq($$ select state, link_payment_id from public.statement_import_lines('00000000-0000-4000-8000-00000000c0a6') $$,
  $$ values ('held', null::uuid) $$, 'with two hand transfers of that amount it is held and cannot be linked to either');
select throws_ok(format($$ select public.link_statement_line(%L) $$, (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a6')),
  '55000', 'ESTA_STATEMENT_LINE_NOT_LINKABLE', 'so Đã ghi tay is refused');
select tests.act_as('member.a@test.esta.test');
select throws_ok(format($$ select public.link_statement_line(%L) $$, (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a4' and row_index = 1)),
  'P0002', 'ESTA_STATEMENT_LINE_NOT_FOUND', 'a member who is not an admin cannot link a line');
select tests.act_as('admin.a@test.esta.test');

-- Constraints for every writer.
reset role;
select throws_ok($$ insert into public.payments (household_id, amount_vnd, received_on, method, source, statement_row_id)
  select household_id, 1, '2026-10-01', 'cash', 'manual', id from public.statement_rows
  where import_id = '00000000-0000-4000-8000-00000000c0a1' and row_index = 5 $$,
  '23514', null, 'only a statement payment names a statement line');
select throws_ok($$ insert into public.payments (household_id, amount_vnd, received_on, method, source, statement_row_id)
  select household_id, 1, '2026-10-01', 'bank_transfer', 'statement_import', statement_row_id from public.payments
  where statement_row_id = (select id from public.statement_rows where import_id = '00000000-0000-4000-8000-00000000c0a1' and row_index = 1) $$,
  '23505', null, 'a statement line posts at most one payment');
select throws_ok($$ update public.statement_rows set status = 'memo_match' where row_index = 5 and import_id = '00000000-0000-4000-8000-00000000c0a1' $$,
  '23514', null, 'a matched line names its bill');

select * from finish();
rollback;
