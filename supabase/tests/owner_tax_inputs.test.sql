begin;
\ir _harness.psql

select plan(21);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset
select id as owner_a from public.parties where household_id = :'a' and 'owner' = any (tags) \gset
select id as owner_b from public.parties where household_id = :'b' and 'owner' = any (tags) \gset

select set_config('esta.actor', 'system:test', true);
insert into public.owner_tax_inputs (household_id, party_id, year, other_business_revenue_vnd) values (:'b', :'owner_b', 2026, 70000000);

select tests.act_as('member.a@test.esta.test');
select lives_ok(format($$
  insert into public.owner_tax_inputs (id, household_id, party_id, year, other_business_revenue_vnd)
  values ('00000000-0000-4000-8000-0000000074a1', %L, %L, 2026, 200000000) $$, :'a', :'owner_a'),
  'a member of A records other business revenue for an owner and year');
select results_eq(
  $$ select action, actor_kind, actor_id from public.audit_log where table_name = 'owner_tax_inputs' and row_id = '00000000-0000-4000-8000-0000000074a1' $$,
  format($$ values ('insert', 'user', %L) $$, :'member_a'),
  'the insert wrote one audit row with the member as actor (FND-2)');
select is((select created_by from public.owner_tax_inputs where id = '00000000-0000-4000-8000-0000000074a1'), :'member_a'::uuid,
  'created_by is the member');

select lives_ok(format($$
  insert into public.owner_tax_inputs (household_id, party_id, year, other_business_revenue_vnd) values (%L, %L, 2026, 0)
  on conflict (household_id, party_id, year) do update set other_business_revenue_vnd = excluded.other_business_revenue_vnd $$, :'a', :'owner_a'),
  'an upsert on the owner and year updates the row in place');
select results_eq(
  format($$ select count(*)::int, max(other_business_revenue_vnd) from public.owner_tax_inputs where household_id = %L $$, :'a'),
  $$ values (1, 0::bigint) $$,
  'one row for the owner and year, now at 0');
select results_eq(
  $$ select action from public.audit_log where table_name = 'owner_tax_inputs' and row_id = '00000000-0000-4000-8000-0000000074a1' order by id $$,
  $$ values ('insert'), ('update') $$,
  'the upsert wrote one update audit row');

select throws_ok(format($$
  insert into public.owner_tax_inputs (household_id, party_id, year) values (%L, %L, 2026) $$, :'a', :'owner_a'),
  '23505', null, 'a second row for the same owner and year is refused');
select throws_ok(format($$
  update public.owner_tax_inputs set other_business_revenue_vnd = -1 where household_id = %L $$, :'a'),
  '23514', null, 'a negative amount is refused');
select throws_ok(format($$
  insert into public.owner_tax_inputs (household_id, party_id, year) values (%L, %L, 1999) $$, :'a', :'owner_a'),
  '23514', null, 'a year outside 2000 to 2100 is refused');
select throws_ok(format($$
  insert into public.owner_tax_inputs (household_id, party_id, year) values (%L, %L, 2027) $$, :'a', :'owner_b'),
  '23503', null, 'an owner of B cannot hold a row of A');
select is((select other_business_revenue_vnd from public.owner_tax_inputs where household_id = :'a' and year = 2026), 0::bigint,
  'a default row starts at 0');

select tests.sees_household('public.owner_tax_inputs', :'a', true);
select tests.sees_household('public.owner_tax_inputs', :'b', false);
select tests.cannot_write('public.owner_tax_inputs', :'b',
  format($$ insert into public.owner_tax_inputs (household_id, party_id, year) values (%L, %L, 2025) $$, :'b', :'owner_b'));

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.owner_tax_inputs', :'a', true);
select tests.cannot_write('public.owner_tax_inputs', :'a',
  format($$ insert into public.owner_tax_inputs (household_id, party_id, year) values (%L, %L, 2025) $$, :'a', :'owner_a'));

select tests.act_as('admin.a@test.esta.test');
select throws_ok(format($$ update public.owner_tax_inputs set household_id = %L where household_id = %L $$, :'b', :'a'),
  null, null, 'household_id is frozen');

select * from finish();
rollback;
