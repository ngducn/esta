begin;
\ir _harness.psql

select plan(43);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Nhà phố Q7', 'Q7', 'townhouse', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0c1', :'a', 'individual', 'Thợ điện Demo', array['contractor']),
  ('00000000-0000-4000-8000-00000000b0c1', :'b', 'individual', 'Thợ B', array['contractor']);
insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'invoice_receipt', 'Hoá đơn sửa điện',
   :'a' || '/00000000-0000-4000-8000-00000000d0a1/hoa-don.jpg', 'image/jpeg', 1000, repeat('a', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000d0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'invoice_receipt', 'Hoá đơn B',
   :'b' || '/00000000-0000-4000-8000-00000000d0b1/hoa-don.jpg', 'image/jpeg', 1000, repeat('b', 64), 'normal');
insert into public.expenses (id, household_id, property_id, category, amount_vnd, paid_on) values
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'repair', 500000, '2026-09-01');

select tests.act_as('member.a@test.esta.test');
select lives_ok(format($$
  insert into public.expenses (id, household_id, property_id, category, amount_vnd, paid_on, vendor_party_id, document_id, note)
  values ('00000000-0000-4000-8000-00000000e0a1', %L, '00000000-0000-4000-8000-0000000000a1', 'repair', 2500000, '2026-10-07',
          '00000000-0000-4000-8000-00000000a0c1', '00000000-0000-4000-8000-00000000d0a1', 'Thay ổ điện tầng 2') $$, :'a'),
  'a member of A records a repair with its vendor and receipt');
select lives_ok(format($$
  insert into public.expenses (id, household_id, property_id, category, amount_vnd, paid_on)
  values ('00000000-0000-4000-8000-00000000e0a1', %L, '00000000-0000-4000-8000-0000000000a1', 'repair', 2500000, '2026-10-07')
  on conflict (id) do nothing $$, :'a'),
  'saving the same id again converges');
select is((select count(*)::int from public.expenses where id = '00000000-0000-4000-8000-00000000e0a1'), 1,
  'a retried save leaves one row');
select results_eq(
  $$ select action, actor_kind, actor_id from public.audit_log where table_name = 'expenses' and row_id = '00000000-0000-4000-8000-00000000e0a1' $$,
  format($$ values ('insert', 'user', %L) $$, :'member_a'),
  'the insert wrote one audit row with the member as actor (FND-2)');
select is((select created_by from public.expenses where id = '00000000-0000-4000-8000-00000000e0a1'), :'member_a'::uuid,
  'created_by is the member');

select tests.sees_household('public.expenses', :'a', true);
select tests.sees_household('public.expenses', :'b', false);
select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000b1', 'repair', 100000, '2026-10-07') $$, :'b'),
  '42501', null, 'a member of A cannot add an expense to B');
select is_empty($$ update public.expenses set amount_vnd = 1 where id = '00000000-0000-4000-8000-00000000e0b1' returning 1 $$,
  'a member of A cannot update an expense of B');
select is_empty($$ update public.expenses set deleted_at = '2026-10-07 09:00+07' where id = '00000000-0000-4000-8000-00000000e0b1' returning 1 $$,
  'a member of A cannot soft delete an expense of B');
select is_empty($$ delete from public.expenses where id = '00000000-0000-4000-8000-00000000e0b1' returning 1 $$,
  'a member of A cannot delete an expense of B');

select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', 0, '2026-10-07') $$, :'a'),
  '23514', null, 'an amount of 0 is refused');
select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', -850000, '2026-10-07') $$, :'a'),
  '23514', null, 'a negative amount is refused');
-- The amount ceiling: MAX_AMOUNT_VND in packages/core/src/money/vnd.ts, which scripts/pgtap-fixtures.test.ts holds equal.
\set amount_ceiling 1000000000000
select lives_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', %s, '2026-10-07') $$, :'a', :amount_ceiling),
  'an amount at the ceiling is taken');
select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', %s, '2026-10-07') $$, :'a', :amount_ceiling + 1),
  '23514', null, 'an amount one đồng above the ceiling is refused');
select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'party', 100000, '2026-10-07') $$, :'a'),
  '23514', null, 'a category outside the ten is refused');
select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on, vendor_party_id)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', 100000, '2026-10-07', '00000000-0000-4000-8000-00000000b0c1') $$, :'a'),
  '23503', null, 'a vendor of another household is refused (FND-2)');
select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on, document_id)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', 100000, '2026-10-07', '00000000-0000-4000-8000-00000000d0b1') $$, :'a'),
  '23503', null, 'a receipt of another household is refused (FND-2)');
select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000b1', 'repair', 100000, '2026-10-07') $$, :'a'),
  '23503', null, 'a property of another household is refused');

select lives_ok($$ update public.expenses set amount_vnd = 1200000, category = 'maintenance' where id = '00000000-0000-4000-8000-00000000e0a1' $$,
  'a member edits the amount and category');
select is_empty($$ delete from public.expenses where id = '00000000-0000-4000-8000-00000000e0a1' returning 1 $$,
  'a member''s DELETE touches no row: deleting is soft');
select isnt_empty($$ update public.expenses set deleted_at = '2026-10-07 09:00+07' where id = '00000000-0000-4000-8000-00000000e0a1' returning 1 $$,
  'a member deletes an expense by setting deleted_at');
select isnt_empty($$ update public.expenses set deleted_at = null where id = '00000000-0000-4000-8000-00000000e0a1' returning 1 $$,
  'Hoàn tác restores it by clearing deleted_at');
select results_eq(
  $$ select action, actor_kind, actor_id, count(*)::int from public.audit_log
     where table_name = 'expenses' and row_id = '00000000-0000-4000-8000-00000000e0a1' group by 1, 2, 3 order by 1 $$,
  format($$ values ('insert', 'user', %L, 1), ('update', 'user', %L, 3) $$, :'member_a', :'member_a'),
  'the edit, the delete and the restore each add one audit row with the member as actor (FND-2)');
select throws_ok(format($$ update public.expenses set household_id = %L where id = '00000000-0000-4000-8000-00000000e0a1' $$, :'b'),
  '23514', 'expenses rows cannot move to another household', 'an expense never moves to another household');

-- save_expense: the expense, a vendor added in the sheet and the receipt photo in one transaction.
select '{"kind": "individual", "full_name": "Thợ nước Demo", "tags": ["contractor"]}' as new_vendor,
  jsonb_build_object('property_id', '00000000-0000-4000-8000-0000000000a1', 'category', 'invoice_receipt', 'title', 'Hoá đơn chi phí',
    'storage_path', :'a' || '/00000000-0000-4000-8000-00000000d0a2/hoa-don.jpg', 'mime', 'image/jpeg', 'size_bytes', 60590,
    'page_count', 1, 'sha256', repeat('c', 64), 'sensitivity', 'normal')::text as new_receipt,
  jsonb_build_object('property_id', '00000000-0000-4000-8000-0000000000a1', 'category', 'invoice_receipt', 'title', 'Hoá đơn chi phí',
    'storage_path', :'a' || '/00000000-0000-4000-8000-00000000d0a3/hoa-don.jpg', 'mime', 'image/jpeg', 'size_bytes', 60590,
    'page_count', 1, 'sha256', repeat('d', 64), 'sensitivity', 'normal')::text as refused_receipt \gset

select ok(
  has_function_privilege('authenticated', 'public.save_expense(uuid, uuid, text, bigint, date, text, uuid, uuid, jsonb, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.save_expense(uuid, uuid, text, bigint, date, text, uuid, uuid, jsonb, jsonb)', 'execute'),
  'members may call save_expense and anon may not');

select results_eq(
  format($$ select id, amount_vnd from public.save_expense('00000000-0000-4000-8000-00000000e0a2', '00000000-0000-4000-8000-0000000000a1',
    'repair', 850000, '2026-10-07', null, '00000000-0000-4000-8000-00000000a0c2', '00000000-0000-4000-8000-00000000d0a2', %L, %L) $$,
    :'new_vendor', :'new_receipt'),
  $$ values ('00000000-0000-4000-8000-00000000e0a2'::uuid, 850000::bigint) $$,
  'a member saves an expense with a new vendor and its receipt photo');
select results_eq(
  $$ select v.full_name, v.tags, d.category, d.household_id, e.household_id
     from public.expenses e join public.parties v on v.id = e.vendor_party_id join public.documents d on d.id = e.document_id
     where e.id = '00000000-0000-4000-8000-00000000e0a2' $$,
  format($$ values ('Thợ nước Demo', array['contractor'], 'invoice_receipt', %L::uuid, %L::uuid) $$, :'a', :'a'),
  'the vendor and the receipt are written in the property''s household and linked to the expense');
select results_eq(
  format($$ select amount_vnd from public.save_expense('00000000-0000-4000-8000-00000000e0a2', '00000000-0000-4000-8000-0000000000a1',
    'repair', 900000, '2026-10-07', null, '00000000-0000-4000-8000-00000000a0c2', '00000000-0000-4000-8000-00000000d0a2', %L, %L) $$,
    :'new_vendor', :'new_receipt'),
  $$ values (900000::bigint) $$,
  'saving the same sheet again converges on what it sent last');
select is(
  array[(select count(*) from public.expenses where id = '00000000-0000-4000-8000-00000000e0a2'),
        (select count(*) from public.parties where id = '00000000-0000-4000-8000-00000000a0c2'),
        (select count(*) from public.documents where id = '00000000-0000-4000-8000-00000000d0a2')]::int[],
  array[1, 1, 1],
  'a retried save leaves one expense, one vendor and one document');

select throws_ok(
  format($$ select * from public.save_expense('00000000-0000-4000-8000-00000000e0a3', '00000000-0000-4000-8000-0000000000a1',
    'repair', 0, '2026-10-07', null, '00000000-0000-4000-8000-00000000a0c3', '00000000-0000-4000-8000-00000000d0a3', %L, %L) $$,
    :'new_vendor', :'refused_receipt'),
  '23514', null, 'an expense of 0 is refused');
select throws_ok(
  format($$ select * from public.save_expense('00000000-0000-4000-8000-00000000e0b1', '00000000-0000-4000-8000-0000000000a1',
    'repair', 100000, '2026-10-07', null, '00000000-0000-4000-8000-00000000a0c3', '00000000-0000-4000-8000-00000000d0a3', %L, %L) $$,
    :'new_vendor', :'refused_receipt'),
  'P0002', 'ESTA_EXPENSE_NOT_FOUND', 'saving over an expense of B is refused');
select is(
  array[(select count(*) from public.parties where id = '00000000-0000-4000-8000-00000000a0c3'),
        (select count(*) from public.documents where id = '00000000-0000-4000-8000-00000000d0a3')]::int[],
  array[0, 0],
  'a refused expense leaves no vendor and no receipt behind');
select throws_ok(
  $$ select * from public.save_expense('00000000-0000-4000-8000-00000000e0a4', '00000000-0000-4000-8000-0000000000b1', 'repair',
       100000, '2026-10-07') $$,
  'P0002', 'ESTA_PROPERTY_NOT_FOUND', 'a member of A cannot save an expense on a property of B');
select is((select count(*)::int from public.expenses where id = '00000000-0000-4000-8000-00000000e0a4'), 0,
  'nothing is written on B''s property');
select lives_ok($$ update public.expenses set deleted_at = '2026-10-07 09:00+07' where id = '00000000-0000-4000-8000-00000000e0a2' $$,
  'a member deletes the expense the sheet saved');
select throws_ok(
  $$ select * from public.save_expense('00000000-0000-4000-8000-00000000e0a2', '00000000-0000-4000-8000-0000000000a1', 'repair',
       100000, '2026-10-07') $$,
  'P0002', 'ESTA_EXPENSE_NOT_FOUND', 'a sheet left open on an expense deleted since then saves nothing');

select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  $$ select * from public.save_expense('00000000-0000-4000-8000-00000000e0a5', '00000000-0000-4000-8000-0000000000a1', 'repair',
       100000, '2026-10-07') $$,
  'P0002', 'ESTA_PROPERTY_NOT_FOUND', 'a viewer cannot save an expense');
select tests.sees_household('public.expenses', :'a', true);
select tests.cannot_write('public.expenses', :'a', format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', 100000, '2026-10-07') $$, :'a'));
select is_empty($$ update public.expenses set deleted_at = '2026-10-07 09:00+07' where id = '00000000-0000-4000-8000-00000000e0a1' returning 1 $$,
  'a viewer cannot delete an expense');

select * from finish();
rollback;
