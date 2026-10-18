-- Documents (SPEC §5.5, DOC-1, DOC-4, DOC-5). The row is written after the browser has put the file in Storage, so
-- the bucket policies let a member write a document's folder only until its row exists. A registered file is then
-- immutable, and no user deletes one: deleting a document archives its row.
-- P2-05 adds search_vector and ocr_text, and P3-07 adds lease_id with its key.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid,
  party_id uuid,
  category text not null check (category in (
    'certificate', 'sale_contract', 'lease_contract', 'tax_receipt', 'building_permit', 'drawing', 'utility_bill',
    'id_card', 'handover', 'photo', 'invoice_receipt', 'insurance', 'other')),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  storage_path text not null,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  page_count integer check (page_count between 1 and 2000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  sensitivity text not null check (sensitivity in ('normal', 'sensitive')),
  expires_on date,
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  foreign key (household_id, party_id) references public.parties (household_id, id) on delete set null (party_id),
  -- Interpolating the row's own ids means a path can only ever name this document's folder (the P1-04 cover pattern).
  constraint documents_storage_path check (
    storage_path ~ ('^' || household_id || '/' || id || '/[a-z0-9-]+(\.[a-z0-9]{1,8})?$')
    and char_length(split_part(storage_path, '/', 3)) <= 100
    and split_part(storage_path, '/', 3) not in ('thumb.webp', 'thumb-blur.webp'))
);
create index documents_household_property_idx on public.documents (household_id, property_id) where deleted_at is null;
create index documents_household_sha256_idx on public.documents (household_id, sha256);

select private.enable_household_rls('public.documents', 'member');
select private.enable_audit('public.documents');
select private.enable_soft_delete('public.documents');

-- Keyed on the household too: a foreign key check ignores RLS, so a bare document id could name another household's.
alter table public.certificates
  add constraint certificates_document_id_fkey foreign key (household_id, document_id)
  references public.documents (household_id, id) on delete set null (document_id);

-- Insert-only: every open of a document by anyone who can read it (DOC-4). Nobody updates or deletes a row.
create table public.document_access_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  document_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null check (action in ('view', 'download', 'share')),
  at timestamptz not null default now(),
  foreign key (household_id, document_id) references public.documents (household_id, id) on delete cascade
);
create index document_access_log_document_idx on public.document_access_log (household_id, document_id, at);

alter table public.document_access_log enable row level security;
revoke all on public.document_access_log from anon, authenticated;
grant select, insert on public.document_access_log to authenticated;
grant all on public.document_access_log to service_role;

create policy document_access_log_select on public.document_access_log for select to authenticated
  using (private.is_member(household_id, 'viewer'));
create policy document_access_log_insert on public.document_access_log for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(household_id, 'viewer'));

-- A user's row names that user and the injected clock (FND-9), whatever the request sends.
create function private.stamp_document_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' is distinct from 'authenticated' then
    return new;
  end if;
  new.user_id := (select auth.uid());
  new.at := private.audit_now();
  return new;
end;
$$;
revoke all on function private.stamp_document_access() from public;

create trigger stamp_document_access
  before insert on public.document_access_log
  for each row execute function private.stamp_document_access();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

-- deleted_at is ignored on purpose: an archived document stays restorable, so its file stays signable.
create function private.document_household(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_document uuid;
begin
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]+(\.[a-z0-9]{1,8})?$'
    or char_length(split_part(p_name, '/', 3)) > 100 then
    return null;
  end if;
  v_household := split_part(p_name, '/', 1)::uuid;
  v_document := split_part(p_name, '/', 2)::uuid;
  if exists (select 1 from public.documents d where d.id = v_document and d.household_id <> v_household) then
    return null;
  end if;
  return v_household;
end;
$$;

-- The household a user may still write a document file for: none once the document's row exists.
create function private.document_upload_household(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.document_household(p_name);
begin
  if v_household is null then
    return null;
  end if;
  if exists (select 1 from public.documents d where d.id = split_part(p_name, '/', 2)::uuid) then
    return null;
  end if;
  return v_household;
end;
$$;

revoke all on function private.document_household(text) from public;
revoke all on function private.document_upload_household(text) from public;
grant execute on function private.document_household(text), private.document_upload_household(text) to authenticated, service_role;

create policy documents_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and private.is_member(private.document_household(name), 'viewer'));

create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.is_member(private.document_upload_household(name), 'member'));

create policy documents_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and private.is_member(private.document_upload_household(name), 'member'))
  with check (bucket_id = 'documents' and private.is_member(private.document_upload_household(name), 'member'));

-- An upload URL signed before the row existed writes as the storage superuser, past the policies above, for as long
-- as the URL lives. Every user write carries its owner, so this refuses any user's file landing on a registered
-- document; the seed and the agent write as the service role, with no owner.
create function private.refuse_registered_document_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bucket_id = 'documents' and new.owner_id is not null and private.document_upload_household(new.name) is null then
    raise exception 'documents: % is registered or not writable', new.name using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_registered_document_write() from public;

create trigger refuse_registered_document_write
  before insert or update on storage.objects
  for each row execute function private.refuse_registered_document_write();

-- The P1-03 facts plus the two document facts (PRP-6).
create or replace view public.property_completeness_facts with (security_invoker = true) as
select
  p.id as property_id,
  p.household_id,
  p.kind,
  coalesce(p.current_address ->> 'commune_code', '') <> ''
    and coalesce(btrim(p.current_address ->> 'street'), '') <> '' as has_current_address,
  p.location is not null as has_location,
  p.acquired_on is not null and p.acquisition_kind is not null as has_acquisition,
  coalesce(parcel.total, 0)::integer as parcel_count,
  parcel.without_number_id as parcel_without_number_id,
  parcel.without_area_id as parcel_without_area_id,
  coalesce(structure.total, 0)::integer as structure_count,
  structure.without_floor_area_id as structure_without_floor_area_id,
  coalesce(share.total_bp, 0)::integer as share_total_bp,
  coalesce(account.total, 0)::integer as utility_account_count,
  coalesce(document.certificates, 0)::integer as certificate_document_count,
  (coalesce(document.photos, 0) + (p.cover_photo_path is not null)::integer)::integer as photo_count
from public.properties p
left join lateral (
  select
    count(*) as total,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.parcel_no is null or x.map_sheet_no is null))[1] as without_number_id,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.area_m2 is null))[1] as without_area_id
  from public.parcels x
  where x.household_id = p.household_id and x.property_id = p.id
) parcel on true
left join lateral (
  select
    count(*) as total,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.floor_area_m2 is null))[1] as without_floor_area_id
  from public.structures x
  where x.household_id = p.household_id and x.property_id = p.id
) structure on true
left join lateral (
  select sum(x.share_bp) as total_bp
  from public.ownership_shares x
  where x.household_id = p.household_id and x.property_id = p.id
) share on true
left join lateral (
  select count(*) as total
  from public.utility_accounts x
  where x.household_id = p.household_id and x.property_id = p.id
) account on true
left join lateral (
  select
    count(*) filter (where x.category = 'certificate') as certificates,
    count(*) filter (where x.category = 'photo') as photos
  from public.documents x
  where x.household_id = p.household_id and x.property_id = p.id and x.deleted_at is null
) document on true
where p.deleted_at is null;
