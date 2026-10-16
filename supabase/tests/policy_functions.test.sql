begin;
\ir _harness.psql

select plan(1);

-- supautils' permission hint segfaults the backend when a session that is not the authenticator sets role
-- anon or authenticated and is then denied a function. PostgREST logs in as the authenticator, but Storage
-- and Realtime log in as other roles and run RLS as the caller, so no policy may call a function its roles
-- cannot execute.
select is_empty(
  $$
    select format('%s on %s calls %s, which %s cannot execute', p.polname, p.polrelid::regclass, d.refobjid::regprocedure, r.rolname)
    from pg_catalog.pg_policy p
    join pg_catalog.pg_depend d
      on d.classid = 'pg_catalog.pg_policy'::regclass and d.objid = p.oid and d.refclassid = 'pg_catalog.pg_proc'::regclass
    join pg_catalog.pg_roles r
      on r.oid = any (p.polroles) or (0 = any (p.polroles) and r.rolname in ('anon', 'authenticated'))
    where not has_function_privilege(r.oid, d.refobjid, 'execute')
  $$,
  'every function a policy calls is executable by each role the policy applies to');

select * from finish();
rollback;
