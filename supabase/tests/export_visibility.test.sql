begin;
select plan(1);

-- An export reads through the exporting admin's session, so a table whose SELECT policy is narrower than "any member
-- of the household (or any admin)" hands that admin fewer rows than the household holds. Every such table must be
-- marked narrowed in EXPORT_TABLES (packages/core/src/export/tables.ts); export-visibility.test.ts reads this list.
select set_eq(
  $$
  select p.tablename::text
  from pg_policies p
  join pg_class c on c.relname = p.tablename and c.relnamespace = 'public'::regnamespace
  where p.schemaname = 'public'
    and p.cmd in ('SELECT', 'ALL')
    and (p.tablename = 'households' or exists (
      select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'household_id' and not a.attisdropped))
    and regexp_replace(p.qual, '\s+', ' ', 'g') !~
      '^\(?(\( SELECT )?private\.is_member\((\w+\.)?(household_id|id), ''(viewer|admin)''::member_role\)( AS is_member\))?\)?$'
  $$,
  $$ values ('agent_items'), ('agent_jobs'), ('agent_runs'), ('audit_log'), ('conversations'), ('messages') $$,
  'the tables whose SELECT policy is narrower than the household');

select * from finish();
