insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 52428800, array['application/zip']);

-- {household_id}/{export_id}.zip, or {household_id}/{export_id}-part-{n}.zip for the parts of a large export.
create function private.export_household(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-part-[0-9]{1,3})?\.zip$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;
revoke all on function private.export_household(text) from public;
grant execute on function private.export_household(text) to authenticated, service_role;

create policy exports_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'exports' and private.is_member(private.export_household(name), 'admin'));

create policy exports_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exports' and private.is_member(private.export_household(name), 'admin'));

-- One download row per document an export holds, written in the same transaction as each other.
create function public.log_export_downloads(p_household_id uuid, p_document_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_logged integer;
begin
  if not private.is_member(p_household_id, 'admin') then
    raise exception 'only an admin logs an export' using errcode = '42501';
  end if;
  insert into public.document_access_log (household_id, document_id, user_id, action)
  select d.household_id, d.id, (select auth.uid()), 'download'
  from public.documents d
  where d.household_id = p_household_id and d.id = any (p_document_ids);
  get diagnostics v_logged = row_count;
  return v_logged;
end;
$$;
revoke all on function public.log_export_downloads(uuid, uuid[]) from public;
grant execute on function public.log_export_downloads(uuid, uuid[]) to authenticated;
