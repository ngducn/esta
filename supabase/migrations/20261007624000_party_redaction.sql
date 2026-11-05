-- Storage refuses a delete from SQL, so the files of an erased ID card are removed through the Storage API by the
-- admin's own session after redact_party has deleted the document rows. The policy opens only a folder no document
-- row names, which is what document_upload_household checks, so a registered document's files stay unremovable.
create policy documents_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.is_member(private.document_upload_household(name), 'admin'));

-- The change history copies every old and new value of a row it records. After an erasure it must not be the copy
-- that survives: each erased column keeps its key and loses its value, so the trail still shows who erased what.
create function private.erase_audit_values(p_table text, p_row_ids uuid[], p_columns text[])
returns void
language sql
set search_path = ''
as $$
  update public.audit_log a
  set diff = (
    select coalesce(jsonb_object_agg(e.key, case when p_columns is null or e.key = any (p_columns) then '{"erased": true}'::jsonb else e.value end), '{}')
    from jsonb_each(a.diff) as e (key, value))
  where a.table_name = p_table and a.row_id = any (p_row_ids);
$$;
revoke all on function private.erase_audit_values(text, uuid[], text[]) from public;

create function public.redact_party(p_party_id uuid, p_as_of date)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_cards uuid[];
  v_extractions uuid[];
  v_objects text[];
begin
  select p.household_id into v_household from public.parties p where p.id = p_party_id for update;
  if v_household is null or not private.is_member(v_household, 'admin') then
    raise exception 'only an admin of the household erases a party' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.leases l
    where l.household_id = v_household and l.tenant_party_id = p_party_id
      and l.status in ('active', 'terminated') and (l.end_date is null or l.end_date >= p_as_of)
  ) then
    raise exception 'ESTA_PARTY_ACTIVE_LEASE' using errcode = 'ES002';
  end if;
  if exists (
    select 1 from public.lease_deposits d
    join public.leases l on l.id = d.lease_id
    where l.household_id = v_household and l.tenant_party_id = p_party_id and d.held_vnd > 0
  ) then
    raise exception 'ESTA_PARTY_DEPOSIT_HELD' using errcode = 'ES002';
  end if;

  select coalesce(array_agg(d.id), '{}') into v_cards
  from public.documents d where d.household_id = v_household and d.party_id = p_party_id and d.category = 'id_card';
  select coalesce(array_agg(x.id), '{}') into v_extractions
  from public.document_extractions x where x.document_id = any (v_cards);
  select coalesce(array_agg(o.name order by o.name), '{}') into v_objects
  from storage.objects o
  where o.bucket_id = 'documents'
    and exists (select 1 from unnest(v_cards) c (id) where o.name like v_household || '/' || c.id || '/%');

  update public.parties
  set full_name = 'Đã xóa', short_name = null, phone = null, zalo_phone = null, email = null, id_last4 = null,
      address_text = null, notes = null
  where id = p_party_id;
  delete from public.documents where id = any (v_cards);

  perform private.erase_audit_values('parties', array[p_party_id],
    array['full_name', 'short_name', 'phone', 'zalo_phone', 'email', 'id_last4', 'address_text', 'notes']);
  perform private.erase_audit_values('documents', v_cards, null);
  perform private.erase_audit_values('document_extractions', v_extractions, null);
  return v_objects;
end;
$$;
revoke all on function public.redact_party(uuid, date) from public;
grant execute on function public.redact_party(uuid, date) to authenticated;
