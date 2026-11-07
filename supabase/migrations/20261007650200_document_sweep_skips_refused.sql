-- The nightly file sweep (#425). It named the first 500 stray files by name, so names Storage kept refusing held the
-- first places every night and the strays behind them never came up; and a folder that gained a row between the
-- listing and the removal lost its file. `p_exclude` lets the sweep skip the names Storage refused, and `p_only` asks
-- the same question about named files just before they are removed, so only those still strays are named.
drop function public.stray_document_files(integer);
create function public.stray_document_files(p_limit integer default 500, p_exclude text[] default '{}', p_only text[] default null)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(s.name order by s.name), '{}')
  from (
    select o.name
    from storage.objects o
    where o.bucket_id = 'documents'
      and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      -- Exception to the injected Clock: a file's age is a fact about Storage, whose created_at is the database's real time.
      and o.created_at < now() - interval '1 day'
      and not exists (select 1 from public.documents d where d.id::text = split_part(o.name, '/', 2))
      and o.name <> all (coalesce(p_exclude, '{}'))
      and (p_only is null or o.name = any (p_only))
    order by o.name
    limit p_limit
  ) s;
$$;
revoke all on function public.stray_document_files(integer, text[], text[]) from public, anon, authenticated;
grant execute on function public.stray_document_files(integer, text[], text[]) to service_role;
