create function private.enable_soft_delete(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = p_table and a.attname = 'deleted_at' and not a.attisdropped
  ) then
    raise exception '% has no deleted_at column', p_table;
  end if;
  execute format('drop policy %I on %s',
    (select c.relname from pg_catalog.pg_class c where c.oid = p_table) || '_delete', p_table);
end;
$$;
revoke all on function private.enable_soft_delete(regclass) from public;

select private.enable_soft_delete('public.properties');
