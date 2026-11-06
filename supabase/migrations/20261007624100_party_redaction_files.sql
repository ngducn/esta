-- redact_party now removes every ID card filed on the person's leases, not only those with party_id, and keeps the
-- names of the files it deletes the rows of. Storage cannot be deleted from SQL, so until the admin's session removes
-- a file, the name stays here: the file is hidden from everyone but an admin, and a second call hands it back.
create table private.file_removals (
  name text primary key,
  household_id uuid not null,
  party_id uuid not null
);
alter table private.file_removals enable row level security;
create index file_removals_party_idx on private.file_removals (party_id);

create function private.file_pending_removal(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.file_removals r where r.name = p_name);
$$;
revoke all on function private.file_pending_removal(text) from public;
grant execute on function private.file_pending_removal(text) to authenticated, service_role;

drop policy documents_objects_select on storage.objects;
create policy documents_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and private.is_member(private.document_household(name), 'viewer')
    and (not private.file_pending_removal(name) or private.is_member(private.document_household(name), 'admin'))
  );

create or replace function public.redact_party(p_party_id uuid, p_as_of date)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_cards uuid[];
  v_extractions uuid[];
begin
  if p_as_of is null then
    raise exception 'redact_party needs the business date' using errcode = '22004';
  end if;
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

  delete from private.file_removals r
  where r.party_id = p_party_id
    and not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = r.name);

  select coalesce(array_agg(d.id), '{}') into v_cards
  from public.documents d
  where d.household_id = v_household and d.category = 'id_card'
    and (d.party_id = p_party_id
      or d.lease_id in (select l.id from public.leases l where l.household_id = v_household and l.tenant_party_id = p_party_id));
  select coalesce(array_agg(x.id), '{}') into v_extractions
  from public.document_extractions x where x.document_id = any (v_cards);

  insert into private.file_removals (name, household_id, party_id)
  select o.name, v_household, p_party_id
  from storage.objects o
  where o.bucket_id = 'documents'
    and exists (select 1 from unnest(v_cards) c (id) where o.name like v_household || '/' || c.id || '/%')
  on conflict (name) do nothing;

  update public.parties
  set full_name = 'Đã xóa', short_name = null, phone = null, zalo_phone = null, email = null, id_last4 = null,
      address_text = null, notes = null
  where id = p_party_id;
  delete from public.documents where id = any (v_cards);

  perform private.erase_audit_values('parties', array[p_party_id],
    array['full_name', 'short_name', 'phone', 'zalo_phone', 'email', 'id_last4', 'address_text', 'notes']);
  perform private.erase_audit_values('documents', v_cards, null);
  perform private.erase_audit_values('document_extractions', v_extractions, null);
  return public.party_pending_files(p_party_id);
end;
$$;

-- The files of this person's erased ID cards that Storage still holds, for the screen that offers to finish the removal.
create function public.party_pending_files(p_party_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select p.household_id into v_household from public.parties p where p.id = p_party_id;
  if v_household is null or not private.is_member(v_household, 'admin') then
    raise exception 'only an admin of the household reads a party''s pending files' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(r.name order by r.name)
    from private.file_removals r
    join storage.objects o on o.bucket_id = 'documents' and o.name = r.name
    where r.party_id = p_party_id
  ), '{}');
end;
$$;

revoke all on function public.redact_party(uuid, date) from public, anon;
revoke all on function public.party_pending_files(uuid) from public, anon;
grant execute on function public.redact_party(uuid, date), public.party_pending_files(uuid) to authenticated;
