begin;
\ir _harness.psql

select plan(30);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;

insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a13', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room'),
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room'),
  ('00000000-0000-4000-8000-000000000a17', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 7', 'room');

-- gone: left with the deposit paid back. live: lease still running. held: left but the deposit is still held.
insert into public.parties (id, household_id, kind, full_name, short_name, phone, zalo_phone, email, id_last4, address_text, notes, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Lê Thị Gone Demo', 'Gone', '+84903000001', '+84903000001', 'gone@demo.test', '1234', '12 Đường Demo', 'Ghi chú Gone', array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a2', :'a', 'individual', 'Trần Văn Live Demo', 'Live', '+84903000002', null, null, '2222', null, null, array['tenant']),
  ('00000000-0000-4000-8000-00000000a0a3', :'a', 'individual', 'Phạm Held Demo', null, '+84903000003', null, null, '3333', null, null, array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B Demo', null, '+84903000009', null, null, '9999', null, null, array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, deposit_vnd, status) values
  ('00000000-0000-4000-8000-00000000e0a1', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13', '00000000-0000-4000-8000-00000000a0a1', '2025-09-16', '2026-09-15', 2800000, 2800000, 'ended'),
  ('00000000-0000-4000-8000-00000000e0a2', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a15', '00000000-0000-4000-8000-00000000a0a2', '2026-01-01', '2026-10-31', 3000000, 3000000, 'active'),
  ('00000000-0000-4000-8000-00000000e0a3', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a17', '00000000-0000-4000-8000-00000000a0a3', '2025-09-16', '2026-09-15', 2800000, 2800000, 'ended'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1', private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 9000000, 'active');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0a01', :'a', '00000000-0000-4000-8000-00000000e0a1', '2026-08-16', '2026-09-15', '2026-08-16', '2026-08-16', 'DIAN-202608-003', 'issued', '2026-08-16T00:30:00+07:00');
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000f0a01', 'rent', 2800000, 2800000);
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c0a01', :'a', '00000000-0000-4000-8000-00000000a0a1', 2800000, '2026-08-16', 'cash');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000c0a01', '00000000-0000-4000-8000-0000000f0a01', 2800000);
insert into public.deposit_entries (id, household_id, lease_id, kind, amount_vnd, on_date) values
  ('00000000-0000-4000-8000-0000000d0a01', :'a', '00000000-0000-4000-8000-00000000e0a1', 'received', 2800000, '2025-09-16'),
  ('00000000-0000-4000-8000-0000000d0a02', :'a', '00000000-0000-4000-8000-00000000e0a1', 'refunded', 2800000, '2026-09-20'),
  ('00000000-0000-4000-8000-0000000d0a31', :'a', '00000000-0000-4000-8000-00000000e0a3', 'received', 2800000, '2025-09-16');

insert into public.documents (id, household_id, party_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0a1', :'a', '00000000-0000-4000-8000-00000000a0a1', 'id_card', 'CCCD Lê Thị Gone mặt trước', :'a' || '/00000000-0000-4000-8000-00000000d0a1/front.jpg', 'image/jpeg', 10, repeat('a', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0a2', :'a', '00000000-0000-4000-8000-00000000a0a1', 'id_card', 'CCCD Lê Thị Gone mặt sau', :'a' || '/00000000-0000-4000-8000-00000000d0a2/back.jpg', 'image/jpeg', 10, repeat('b', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0a3', :'a', '00000000-0000-4000-8000-00000000a0a1', 'lease_contract', 'Hợp đồng Phòng 3', :'a' || '/00000000-0000-4000-8000-00000000d0a3/hd.pdf', 'application/pdf', 10, repeat('c', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000d0a4', :'a', '00000000-0000-4000-8000-00000000a0a2', 'id_card', 'CCCD Live', :'a' || '/00000000-0000-4000-8000-00000000d0a4/front.jpg', 'image/jpeg', 10, repeat('d', 64), 'sensitive');
insert into public.document_access_log (household_id, document_id, user_id, action) values
  (:'a', '00000000-0000-4000-8000-00000000d0a1', tests.user_id('admin.a@test.esta.test'), 'view');
insert into storage.objects (bucket_id, name) values
  ('documents', :'a' || '/00000000-0000-4000-8000-00000000d0a1/front.jpg'),
  ('documents', :'a' || '/00000000-0000-4000-8000-00000000d0a1/thumb.webp'),
  ('documents', :'a' || '/00000000-0000-4000-8000-00000000d0a2/back.jpg'),
  ('documents', :'a' || '/00000000-0000-4000-8000-00000000d0a3/hd.pdf'),
  ('documents', :'a' || '/00000000-0000-4000-8000-00000000d0a4/front.jpg');

reset role;
\set gone '''00000000-0000-4000-8000-00000000a0a1'''
\set live '''00000000-0000-4000-8000-00000000a0a2'''
\set held '''00000000-0000-4000-8000-00000000a0a3'''
\set other '''00000000-0000-4000-8000-00000000b0b1'''

select tests.act_as('viewer.a@test.esta.test');
select throws_ok(format($$ select public.redact_party(%L, '2026-10-07') $$, :gone), '42501', null, 'a viewer cannot redact a party');
select tests.act_as('member.a@test.esta.test');
select throws_ok(format($$ select public.redact_party(%L, '2026-10-07') $$, :gone), '42501', null, 'a member who is not an admin cannot redact a party');
select tests.act_as('admin.a@test.esta.test');
select throws_ok(format($$ select public.redact_party(%L, '2026-10-07') $$, :other), '42501', null, 'an admin of A cannot redact B''s party');
select throws_ok($$ select public.redact_party('00000000-0000-4000-8000-0000000000ff', '2026-10-07') $$, '42501', null, 'a party that does not exist is refused the same way');
select tests.clear_request();
select throws_ok(format($$ select public.redact_party(%L, '2026-10-07') $$, :gone), '42501', null, 'a caller with no session cannot redact a party');
select has_function('public', 'redact_party', array['uuid', 'date'], 'redact_party takes the party and the business date');
select is((select count(*)::int from information_schema.routine_privileges where specific_schema = 'public' and routine_name = 'redact_party' and grantee in ('anon', 'public')), 0, 'neither anon nor public may execute it');

select tests.act_as('admin.a@test.esta.test');
select throws_ok(format($$ select public.redact_party(%L, '2026-10-07') $$, :live), 'ES002', 'ESTA_PARTY_ACTIVE_LEASE', 'a party with a running lease is refused');
select throws_ok(format($$ select public.redact_party(%L, '2026-10-31') $$, :live), 'ES002', 'ESTA_PARTY_ACTIVE_LEASE', 'the day a lease ends it still runs');
select throws_ok(format($$ select public.redact_party(%L, '2026-10-07') $$, :held), 'ES002', 'ESTA_PARTY_DEPOSIT_HELD', 'a party whose old lease still holds a deposit is refused');
select is((select full_name from public.parties where id = :held), 'Phạm Held Demo', 'a refusal changes nothing');
select is((select count(*)::int from public.documents where party_id = :live and category = 'id_card'), 1, 'a refused party keeps its ID card documents');

reset role;
create function pg_temp.footprint() returns text language sql as $f$
  select concat_ws('|',
    (select count(*) from public.leases where household_id = current_setting('tests.a')::uuid),
    (select count(*) from public.invoices where household_id = current_setting('tests.a')::uuid),
    (select count(*) from public.payments where household_id = current_setting('tests.a')::uuid),
    (select count(*) from public.deposit_entries where household_id = current_setting('tests.a')::uuid),
    (select sum(amount_vnd) from public.invoice_lines where household_id = current_setting('tests.a')::uuid),
    (select sum(amount_vnd) from public.payments where household_id = current_setting('tests.a')::uuid))
$f$;
select set_config('tests.a', :'a', true);
select set_config('tests.before', pg_temp.footprint(), true);
select tests.act_as('admin.a@test.esta.test');

select results_eq(
  format($$ select array_length(public.redact_party(%L, '2026-10-07'), 1) $$, :gone),
  $$ values (3) $$,
  'redaction hands back the three storage objects of the two ID cards for the caller to remove');

select results_eq(
  format($$ select full_name, short_name, phone, zalo_phone, email, id_last4, address_text, notes from public.parties where id = %L $$, :gone),
  $$ values ('Đã xóa'::text, null::text, null::text, null::text, null::text, null::text, null::text, null::text) $$,
  'the name reads Đã xóa and every contact field is cleared');
select is((select tags from public.parties where id = :gone), array['tenant'], 'the party keeps its tag');
select is((select count(*)::int from public.documents where party_id = :gone and category = 'id_card'), 0, 'the ID card documents are gone');
select is((select count(*)::int from public.documents where party_id = :gone and category = 'lease_contract'), 1, 'the lease contract stays');
select is((select count(*)::int from public.documents where id = '00000000-0000-4000-8000-00000000d0a4'), 1, 'another party''s ID card stays');
select is((select count(*)::int from public.document_access_log where document_id = '00000000-0000-4000-8000-00000000d0a1'), 0, 'the access log of an erased document goes with it');

reset role;
select is(pg_temp.footprint(), current_setting('tests.before'), 'leases, invoices, payments, deposit entries and billed and paid totals are unchanged');
select ok(current_setting('tests.before') ~ '^3\|1\|1\|', 'and the footprint compared is not empty');
select is((select tenant_party_id from public.leases where id = '00000000-0000-4000-8000-00000000e0a1'), '00000000-0000-4000-8000-00000000a0a1'::uuid, 'the lease still names the party');

select is((select count(*)::int from public.audit_log where table_name = 'parties' and row_id = :gone::uuid and diff::text ~ 'Lê Thị|Gone|0903|demo\.test|1234|Đường Demo'), 0,
  'no audit row of the party keeps an erased value');
select is((select count(*)::int from public.audit_log where table_name = 'documents' and row_id in ('00000000-0000-4000-8000-00000000d0a1', '00000000-0000-4000-8000-00000000d0a2') and diff::text ~ 'CCCD|front|back'), 0,
  'no audit row of an erased ID card keeps its title or path');
select results_eq(
  format($$ select action, actor_kind, actor_id from public.audit_log where table_name = 'parties' and row_id = %L and diff ? 'full_name' order by id desc limit 1 $$, :gone),
  format($$ values ('update'::text, 'user'::text, %L::text) $$, tests.user_id('admin.a@test.esta.test')::text),
  'the audit trail still records who erased the party');
select is((select diff -> 'full_name' from public.audit_log where table_name = 'parties' and row_id = :gone::uuid and diff ? 'full_name' order by id desc limit 1), '{"erased": true}'::jsonb,
  'it shows which field was erased and not what it held');

select tests.act_as('admin.a@test.esta.test');
select is((select array_length(public.redact_party(:gone, '2026-10-07'), 1)), null, 'erasing the party again is harmless and has nothing more to remove');

select set_config('storage.allow_delete_query', 'true', true);
select tests.act_as('member.a@test.esta.test');
select is_empty(format($$ delete from storage.objects where bucket_id = 'documents' and name = %L returning 1 $$, :'a' || '/00000000-0000-4000-8000-00000000d0a2/back.jpg'),
  'a member who is not an admin removes no file');
select tests.act_as('admin.a@test.esta.test');
select is_empty(format($$ delete from storage.objects where bucket_id = 'documents' and name = %L returning 1 $$, :'a' || '/00000000-0000-4000-8000-00000000d0a3/hd.pdf'),
  'an admin removes no file of a document that still has its row');
select results_eq(
  format($$ with d as (delete from storage.objects where bucket_id = 'documents' and split_part(name, '/', 2) in (%L, %L) returning 1) select count(*)::int from d $$,
    '00000000-0000-4000-8000-00000000d0a1', '00000000-0000-4000-8000-00000000d0a2'),
  $$ values (3) $$,
  'an admin removes the files of the erased ID cards, thumbnail included');

select * from finish();
