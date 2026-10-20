begin;
\ir _harness.psql

select plan(24);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as admin_a \gset
select id as owner_a from public.parties where household_id = :'a' and 'owner' = any (tags) \gset
select id as owner_b from public.parties where household_id = :'b' and 'owner' = any (tags) \gset

select set_config('esta.actor', 'system:test', true);
insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, is_default) values
  ('00000000-0000-4000-8000-00000000ba01', :'b', '970436', '0123456789', 'NGUYEN THI DEMO', true);

select tests.act_as('admin.a@test.esta.test');
select lives_ok(format($$
  insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, owner_party_id, is_default)
  values ('00000000-0000-4000-8000-00000000aa01', %L, '970436', '0123456789', 'NGUYEN THI DEMO', %L, true) $$, :'a', :'owner_a'),
  'an admin of A adds the default receiving account');
select results_eq(
  $$ select action, actor_kind, actor_id from public.audit_log where table_name = 'bank_accounts' and row_id = '00000000-0000-4000-8000-00000000aa01' $$,
  format($$ values ('insert', 'user', %L) $$, :'admin_a'),
  'the insert wrote one audit row with the admin as actor (FND-2)');
select is((select created_by from public.bank_accounts where id = '00000000-0000-4000-8000-00000000aa01'), :'admin_a'::uuid,
  'created_by is the admin');
select throws_ok(format($$
  insert into public.bank_accounts (household_id, bank_bin, account_no, account_name, is_default)
  values (%L, '970403', '0011012345678', 'NGUYEN THI DEMO', true) $$, :'a'),
  '23505', null, 'a household has one default account');
select lives_ok(format($$
  insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name)
  values ('00000000-0000-4000-8000-00000000aa02', %L, '970403', '0011012345678', 'TRAN MINH DEMO') $$, :'a'),
  'a second account is not the default');
select throws_ok(format($$
  insert into public.bank_accounts (household_id, bank_bin, account_no, account_name)
  values (%L, '970436', '0123456789', 'NGUYEN THI DEMO') $$, :'a'),
  '23505', null, 'the same account twice is refused');
select throws_ok(format($$
  insert into public.bank_accounts (household_id, bank_bin, account_no, account_name)
  values (%L, '999999', '0123456789', 'NGUYEN THI DEMO') $$, :'a'),
  '23503', null, 'a BIN missing from bank_bins is refused');
select throws_ok(format($$
  insert into public.bank_accounts (household_id, bank_bin, account_no, account_name)
  values (%L, '970436', '01234567890123456789', 'NGUYEN THI DEMO') $$, :'a'),
  '23514', null, 'an account number over the 19 characters VietQR carries is refused');
select throws_ok(format($$
  insert into public.bank_accounts (household_id, bank_bin, account_no, account_name)
  values (%L, '970436', '0123 456', 'NGUYEN THI DEMO') $$, :'a'),
  '23514', null, 'an account number with a space is refused');
select throws_ok(format($$
  insert into public.bank_accounts (household_id, bank_bin, account_no, account_name)
  values (%L, '970436', '555', 'Nguyễn Thị Demo') $$, :'a'),
  '23514', null, 'an account name with lowercase or diacritics is refused');
select throws_ok(format($$
  insert into public.bank_accounts (household_id, bank_bin, account_no, account_name, owner_party_id)
  values (%L, '970436', '556', 'NGUYEN THI DEMO', %L) $$, :'a', :'owner_b'),
  '23503', null, 'an owner party of B cannot hold an account of A');
select lives_ok($$ update public.bank_accounts set is_default = false where id = '00000000-0000-4000-8000-00000000aa01' $$,
  'an admin changes which account is the default');

select tests.sees_household('public.bank_accounts', :'a', true);
select tests.sees_household('public.bank_accounts', :'b', false);
select tests.cannot_write('public.bank_accounts', :'b',
  format($$ insert into public.bank_accounts (household_id, bank_bin, account_no, account_name) values (%L, '970436', '777', 'DEMO') $$, :'b'));

select tests.act_as('member.a@test.esta.test');
select tests.sees_household('public.bank_accounts', :'a', true);
select tests.cannot_write('public.bank_accounts', :'a',
  format($$ insert into public.bank_accounts (household_id, bank_bin, account_no, account_name) values (%L, '970436', '778', 'DEMO') $$, :'a'));

select tests.act_as('viewer.a@test.esta.test');
select tests.cannot_write('public.bank_accounts', :'a',
  format($$ insert into public.bank_accounts (household_id, bank_bin, account_no, account_name) values (%L, '970436', '779', 'DEMO') $$, :'a'));

select * from finish();
rollback;
