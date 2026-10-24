begin;
\ir _harness.psql

select plan(24);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as admin_a \gset

select set_config('esta.actor', 'system:test', true);
insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, is_default) values
  ('00000000-0000-4000-8000-00000000aa01', :'a', '970436', '0123456789', 'NGUYEN THI DEMO', true),
  ('00000000-0000-4000-8000-00000000aa02', :'a', '970403', '0011012345678', 'TRAN MINH DEMO', false),
  ('00000000-0000-4000-8000-00000000aa03', :'a', '970415', '1020304050', 'NGUYEN THI DEMO', false),
  ('00000000-0000-4000-8000-00000000aa04', :'a', '970422', '5566778899', 'NGUYEN THI DEMO', false),
  ('00000000-0000-4000-8000-00000000ba01', :'b', '970436', '0123456789', 'NGUYEN THI DEMO', true);
insert into public.payments (id, household_id, amount_vnd, received_on, method, bank_account_id) values
  ('00000000-0000-4000-8000-0000000c0a01', :'a', 3000000, '2026-10-02', 'bank_transfer', '00000000-0000-4000-8000-00000000aa03');
insert into public.statement_imports (household_id, bank_account_id, file_name, column_mapping) values
  (:'a', '00000000-0000-4000-8000-00000000aa04', 'sao-ke-demo.xlsx', '{}');

select ok(not has_function_privilege('anon', 'public.set_default_bank_account(uuid)', 'execute'),
  'anon cannot move a default');

select tests.act_as('admin.a@test.esta.test');
select lives_ok($$ select public.set_default_bank_account('00000000-0000-4000-8000-00000000aa02') $$,
  'an admin moves the default to another account');
select results_eq(
  format($$ select id::text from public.bank_accounts where household_id = %L and is_default $$, :'a'),
  $$ values ('00000000-0000-4000-8000-00000000aa02') $$,
  'the household has exactly one default, the one the admin picked');
select results_eq(
  $$ select row_id::text, action, actor_id from public.audit_log
     where table_name = 'bank_accounts' and action = 'update' order by row_id $$,
  format($$ values ('00000000-0000-4000-8000-00000000aa01', 'update', %L), ('00000000-0000-4000-8000-00000000aa02', 'update', %L) $$, :'admin_a', :'admin_a'),
  'the move wrote one audit row per account changed, with the admin as actor (FND-2)');
select lives_ok($$ select public.set_default_bank_account('00000000-0000-4000-8000-00000000aa02') $$,
  'picking the default again changes nothing');
select is(
  (select count(*)::int from public.audit_log where table_name = 'bank_accounts' and action = 'update'
     and row_id in ('00000000-0000-4000-8000-00000000aa01', '00000000-0000-4000-8000-00000000aa02')),
  2, 'the repeated pick wrote no audit row');
select throws_ok($$ select public.set_default_bank_account('00000000-0000-4000-8000-00000000ba01') $$,
  'P0002', 'ESTA_BANK_ACCOUNT_NOT_FOUND', 'an admin of A cannot move the default of B');

select throws_ok($$ delete from public.bank_accounts where id = '00000000-0000-4000-8000-00000000aa02' $$,
  '23001', 'ESTA_BANK_ACCOUNT_IS_DEFAULT', 'the default account cannot be removed');
select is((select is_default from public.bank_accounts where id = '00000000-0000-4000-8000-00000000aa02'), true,
  'the refused removal left the default in place');

select throws_ok($$ delete from public.bank_accounts where id = '00000000-0000-4000-8000-00000000aa03' $$,
  '23503', null, 'an account a payment landed in cannot be removed');
select is((select bank_account_id::text from public.payments where id = '00000000-0000-4000-8000-0000000c0a01'), '00000000-0000-4000-8000-00000000aa03',
  'the payment still names its account');

select throws_ok($$ update public.bank_accounts set account_no = '1020304051' where id = '00000000-0000-4000-8000-00000000aa03' $$,
  '23001', 'ESTA_BANK_ACCOUNT_NUMBER_LOCKED', 'an account a payment landed in keeps its number');
select throws_ok($$ update public.bank_accounts set bank_bin = '970436' where id = '00000000-0000-4000-8000-00000000aa03' $$,
  '23001', 'ESTA_BANK_ACCOUNT_NUMBER_LOCKED', 'an account a payment landed in keeps its bank');
select throws_ok($$ update public.bank_accounts set account_no = '5566778890' where id = '00000000-0000-4000-8000-00000000aa04' $$,
  '23001', 'ESTA_BANK_ACCOUNT_NUMBER_LOCKED', 'an account a statement was imported from keeps its number');
select lives_ok($$ update public.bank_accounts set account_name = 'NGUYEN THI B DEMO' where id = '00000000-0000-4000-8000-00000000aa03' $$,
  'the holder name of an account a payment landed in can be corrected');
select lives_ok($$ update public.bank_accounts set account_no = '0123456780' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  'an account nothing names can take a corrected number');

select lives_ok($$ delete from public.bank_accounts where id = '00000000-0000-4000-8000-00000000aa01' $$,
  'an admin removes an account nothing names');
select throws_ok($$ select public.set_default_bank_account('00000000-0000-4000-8000-00000000aa01') $$,
  'P0002', 'ESTA_BANK_ACCOUNT_NOT_FOUND', 'the removed account cannot become the default');

select tests.act_as('member.a@test.esta.test');
select throws_ok($$ select public.set_default_bank_account('00000000-0000-4000-8000-00000000aa03') $$,
  '42501', 'ESTA_BANK_ACCOUNT_ADMIN_ONLY', 'a member cannot move the default');

select tests.act_as('viewer.a@test.esta.test');
select throws_ok($$ select public.set_default_bank_account('00000000-0000-4000-8000-00000000aa03') $$,
  '42501', 'ESTA_BANK_ACCOUNT_ADMIN_ONLY', 'a viewer cannot move the default');
select tests.clear_request();
reset role;
select results_eq(
  format($$ select household_id::text, id::text from public.bank_accounts where is_default and household_id in (%L, %L) order by household_id = %L::uuid $$, :'a', :'b', :'b'),
  format($$ values (%L, '00000000-0000-4000-8000-00000000aa02'), (%L, '00000000-0000-4000-8000-00000000ba01') $$, :'a', :'b'),
  'the refused calls left A''s default where its admin put it, and B''s untouched');

select lives_ok(format($$ delete from public.households where id = %L $$, :'a'),
  'removing a household takes its default account and the accounts its payment and statement name');
select is((select count(*)::int from public.bank_accounts where household_id = :'a'), 0,
  'none of the household''s accounts remain');
select is((select count(*)::int from public.bank_accounts where household_id = :'b'), 1,
  'the other household keeps its account');

select * from finish();
rollback;
