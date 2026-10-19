begin;
\ir _harness.psql

select plan(29);

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
select throws_ok(format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', 1000000000001, '2026-10-07') $$, :'a'),
  '23514', null, 'an amount above 1.000 tỷ is refused');
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

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.expenses', :'a', true);
select tests.cannot_write('public.expenses', :'a', format($$
  insert into public.expenses (household_id, property_id, category, amount_vnd, paid_on)
  values (%L, '00000000-0000-4000-8000-0000000000a1', 'repair', 100000, '2026-10-07') $$, :'a'));
select is_empty($$ update public.expenses set deleted_at = '2026-10-07 09:00+07' where id = '00000000-0000-4000-8000-00000000e0a1' returning 1 $$,
  'a viewer cannot delete an expense');

select * from finish();
rollback;
