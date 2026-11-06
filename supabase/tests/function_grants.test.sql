begin;
\ir _harness.psql

select plan(8);

select is(
  (select count(*)::int from pg_default_acl d, aclexplode(d.defaclacl) a
   where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'f' and a.grantee = 'anon'::regrole),
  0, 'the default privileges for postgres in public no longer name anon');
select ok(not has_function_privilege('anon', 'public.log_export_downloads(uuid, uuid[])', 'execute'), 'anon cannot log an export download');
select ok(has_function_privilege('authenticated', 'public.log_export_downloads(uuid, uuid[])', 'execute'), 'a signed-in member still can');
select ok(has_function_privilege('anon', 'public.invoice_qr_by_token(text)', 'execute'), 'anon still reads a bill by its token');
select ok(not has_function_privilege('anon', 'public.esta_unaccent(text)', 'execute'), 'anon cannot run the name helpers');
select ok(not has_function_privilege('public', 'private.touch_updated_at()', 'execute'), 'a trigger function is not open to everyone');
select ok(not has_function_privilege('anon', 'private.statement_text_key(text)', 'execute'), 'anon cannot run the statement text key');
select ok(has_function_privilege('authenticated', 'private.statement_text_key(text)', 'execute'), 'a signed-in member can, because the statement views call it');

select * from finish();
rollback;
