-- Three leftovers of the former-tenant erase (#420): redact_party refuses a person who was never a tenant, and a
-- draft lease counts as running. Then the nightly sweep of the documents bucket (#207): files nobody registered,
-- and the files of erased ID cards that an interrupted erase left in Storage. Storage cannot be deleted from SQL, so
-- these functions only name what to remove and clear the names once the files are gone.
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

  if not exists (select 1 from public.leases l where l.household_id = v_household and l.tenant_party_id = p_party_id) then
    raise exception 'ESTA_PARTY_NOT_TENANT' using errcode = 'ES002';
  end if;
  if exists (
    select 1 from public.leases l
    where l.household_id = v_household and l.tenant_party_id = p_party_id
      and l.status in ('draft', 'active', 'terminated') and (l.end_date is null or l.end_date >= p_as_of)
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

revoke all on function public.redact_party(uuid, date) from public, anon;
grant execute on function public.redact_party(uuid, date) to authenticated;

-- Files in the documents bucket older than a day, in a folder no document row names: an upload that was cancelled
-- before the row was saved. Only a folder-shaped name counts; p_now comes from the injected Clock.
create function public.stray_document_files(p_now timestamptz, p_limit integer default 500)
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
      and o.created_at < p_now - interval '1 day'
      and not exists (select 1 from public.documents d where d.id::text = split_part(o.name, '/', 2))
    order by o.name
    limit p_limit
  ) s;
$$;

-- Names in private.file_removals whose file Storage still holds. A household's member asks for one household's names
-- (an export skips them); the service role asks for all (the sweep removes them).
create function public.pending_file_removal_names(p_household_id uuid default null)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_service boolean := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role';
begin
  if not v_service and (p_household_id is null or not private.is_member(p_household_id, 'viewer')) then
    raise exception 'only a member reads the files waiting to be removed' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(r.name order by r.name)
    from private.file_removals r
    join storage.objects o on o.bucket_id = 'documents' and o.name = r.name
    where p_household_id is null or r.household_id = p_household_id
  ), '{}');
end;
$$;

-- Drops the names whose file is gone, and returns how many.
create function public.settle_file_removals()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from private.file_removals r
    where not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = r.name)
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.stray_document_files(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.settle_file_removals() from public, anon, authenticated;
revoke all on function public.pending_file_removal_names(uuid) from public, anon;
grant execute on function public.stray_document_files(timestamptz, integer), public.settle_file_removals() to service_role;
grant execute on function public.pending_file_removal_names(uuid) to authenticated, service_role;
