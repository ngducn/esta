begin;
\ir _harness.psql

-- Whoever signs up first for an address can set user metadata, so SQL never reads it (#23). The lint covers TypeScript.
select plan(2);

select is_empty(
  $$ select format('%I.%I', n.nspname, p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosrc ~* 'user_meta' $$,
  'no function in public or private reads user metadata');

select is_empty(
  $$ select format('%I on %I.%I', policyname, schemaname, tablename)
     from pg_policies
     where concat(qual, ' ', with_check) ~* 'user_meta' $$,
  'no row level security policy reads user metadata');

select * from finish();
rollback;
