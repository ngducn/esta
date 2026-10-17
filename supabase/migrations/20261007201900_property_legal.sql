-- Parcels, structures and certificates (SPEC §5.3, PRP-2). Field names follow the certificate_v1 extraction schema
-- (DOMAIN-VN §2.1), so accepting an extraction (P2-07) maps field to field.

create function private.valid_iso_date(p_value jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_typeof(p_value) = 'string'
    and (p_value #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and pg_catalog.pg_input_is_valid(p_value #>> '{}', 'date');
$$;

-- An area is a positive number of square meters with at most two decimals, the scale of numeric(12,2).
create function private.valid_area(p_value jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'number' then
    (p_value::numeric) > 0 and (p_value::numeric) < 10000000000 and (p_value::numeric) * 100 = trunc((p_value::numeric) * 100)
  else false end;
$$;

create function private.valid_purposes(p_purposes jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_typeof(p_purposes) = 'array' and jsonb_array_length(p_purposes) <= 20 and not exists (
    select 1
    from jsonb_array_elements(p_purposes) as p (item)
    where not (
      jsonb_typeof(p.item) = 'object'
      and not exists (select 1 from jsonb_object_keys(p.item) as k (key) where k.key not in ('land_use_code', 'area_m2', 'term'))
      and jsonb_typeof(p.item -> 'land_use_code') = 'string'
      and btrim(p.item ->> 'land_use_code') <> ''
      and char_length(p.item ->> 'land_use_code') <= 20
      and (p.item -> 'area_m2' is null or private.valid_area(p.item -> 'area_m2'))
      and (p.item -> 'term' is null or p.item -> 'term' = '"long_term"' or private.valid_iso_date(p.item -> 'term'))
    )
  );
$$;

create function private.valid_mortgage(p_mortgage jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_typeof(p_mortgage) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(p_mortgage) as k (key)
      where k.key not in ('bank_party_id', 'amount_vnd', 'registered_on', 'released_on'))
    and jsonb_typeof(p_mortgage -> 'bank_party_id') = 'string'
    and pg_catalog.pg_input_is_valid(p_mortgage ->> 'bank_party_id', 'uuid')
    and case when jsonb_typeof(p_mortgage -> 'amount_vnd') = 'number' then
      (p_mortgage -> 'amount_vnd')::numeric = trunc((p_mortgage -> 'amount_vnd')::numeric)
      and (p_mortgage -> 'amount_vnd')::numeric between 0 and 9007199254740991
    else false end
    and (p_mortgage -> 'registered_on' is null or private.valid_iso_date(p_mortgage -> 'registered_on'))
    and (p_mortgage -> 'released_on' is null or private.valid_iso_date(p_mortgage -> 'released_on'))
    and (p_mortgage -> 'registered_on' is null or p_mortgage -> 'released_on' is null
      or (p_mortgage ->> 'registered_on') <= (p_mortgage ->> 'released_on'));
$$;

create function private.valid_annotations(p_annotations jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_typeof(p_annotations) = 'array' and jsonb_array_length(p_annotations) <= 50 and not exists (
    select 1
    from jsonb_array_elements(p_annotations) as a (item)
    where not (
      jsonb_typeof(a.item) = 'object'
      and not exists (select 1 from jsonb_object_keys(a.item) as k (key) where k.key not in ('date', 'text', 'kind'))
      and jsonb_typeof(a.item -> 'text') = 'string'
      and btrim(a.item ->> 'text') <> ''
      and char_length(a.item ->> 'text') <= 2000
      and (a.item -> 'date' is null or private.valid_iso_date(a.item -> 'date'))
      and (a.item -> 'kind' is null
        or (a.item ->> 'kind') in ('mortgage', 'mortgage_release', 'transfer', 'change_of_area', 'other'))
    )
  );
$$;

revoke all on function private.valid_iso_date(jsonb) from public;
revoke all on function private.valid_area(jsonb) from public;
revoke all on function private.valid_purposes(jsonb) from public;
revoke all on function private.valid_mortgage(jsonb) from public;
revoke all on function private.valid_annotations(jsonb) from public;
grant execute on function private.valid_iso_date(jsonb), private.valid_area(jsonb), private.valid_purposes(jsonb),
  private.valid_mortgage(jsonb), private.valid_annotations(jsonb) to authenticated, service_role;

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  form text not null check (form in ('so_do_pre2009', 'so_hong_pre2009', 'gcn_2009_2024', 'gcn_2024', 'paper_only')),
  serial_no text check (btrim(serial_no) <> '' and char_length(serial_no) <= 40),
  book_entry_no text check (btrim(book_entry_no) <> '' and char_length(book_entry_no) <= 40),
  issued_on date,
  issued_by text check (btrim(issued_by) <> '' and char_length(issued_by) <= 300),
  holder_party_ids uuid[] not null default '{}' check (cardinality(holder_party_ids) <= 20),
  status text not null default 'valid' check (status in ('valid', 'mortgaged', 'replaced', 'lost')),
  mortgage jsonb check (mortgage is null or private.valid_mortgage(mortgage)),
  annotations jsonb not null default '[]' check (private.valid_annotations(annotations)),
  document_id uuid,
  extraction_id uuid,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, property_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  -- A released mortgage stays on record under any status; only an open one makes the certificate mortgaged.
  constraint certificates_mortgaged_status check (
    (status = 'mortgaged') = coalesce(mortgage is not null and mortgage -> 'released_on' is null, false))
);
create index certificates_household_property_idx on public.certificates (household_id, property_id);

create table public.parcels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  certificate_id uuid,
  parcel_no text check (btrim(parcel_no) <> '' and char_length(parcel_no) <= 20),
  map_sheet_no text check (btrim(map_sheet_no) <> '' and char_length(map_sheet_no) <= 20),
  area_m2 numeric(12, 2) check (area_m2 > 0),
  use_form text check (use_form in ('private', 'shared')),
  purposes jsonb not null default '[]' check (private.valid_purposes(purposes)),
  origin_text text check (btrim(origin_text) <> '' and char_length(origin_text) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  foreign key (household_id, property_id, certificate_id)
    references public.certificates (household_id, property_id, id) on delete set null (certificate_id)
);
create index parcels_household_property_idx on public.parcels (household_id, property_id);
create index parcels_certificate_idx on public.parcels (household_id, property_id, certificate_id);

create table public.structures (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  certificate_id uuid,
  kind text not null check (btrim(kind) <> '' and char_length(kind) <= 120),
  footprint_m2 numeric(12, 2) check (footprint_m2 > 0),
  floor_area_m2 numeric(12, 2) check (floor_area_m2 > 0),
  floors smallint check (floors between 1 and 200),
  structure_text text check (btrim(structure_text) <> '' and char_length(structure_text) <= 500),
  completed_year smallint check (completed_year between 1800 and 2200),
  ownership_term text check (btrim(ownership_term) <> '' and char_length(ownership_term) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  foreign key (household_id, property_id, certificate_id)
    references public.certificates (household_id, property_id, id) on delete set null (certificate_id)
);
create index structures_household_property_idx on public.structures (household_id, property_id);
create index structures_certificate_idx on public.structures (household_id, property_id, certificate_id);

-- holder_party_ids and the mortgage bank are ids inside jsonb and an array, which a foreign key cannot reach. Security
-- definer, so a party hidden by RLS and a party that does not exist fail the same way. A user who cannot write the
-- household skips the check and meets the RLS refusal, so the error never says whether another household's party exists.
create function private.check_certificate_parties()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := new.holder_party_ids;
begin
  if (select auth.uid()) is not null and not private.is_member(new.household_id, 'member') then
    return new;
  end if;
  if pg_catalog.pg_input_is_valid(new.mortgage ->> 'bank_party_id', 'uuid') then
    v_ids := v_ids || (new.mortgage ->> 'bank_party_id')::uuid;
  end if;
  if exists (
    select 1 from unnest(v_ids) as i (party_id)
    where not exists (select 1 from public.parties p where p.household_id = new.household_id and p.id = i.party_id)
  ) then
    raise exception 'certificate party is not in household %', new.household_id using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.check_certificate_parties() from public;

create trigger check_certificate_parties
  before insert or update of household_id, holder_party_ids, mortgage on public.certificates
  for each row execute function private.check_certificate_parties();

-- verified_at set by a user is a request to verify: the stamp is the user and the clock, never client values. Other
-- writers (the service role for P2 extraction, seeds) keep the values they send.
create function private.stamp_certificate_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' is distinct from 'authenticated' then
    return new;
  end if;
  if new.verified_at is null then
    new.verified_by := null;
  elsif tg_op = 'INSERT' or old.verified_at is null then
    new.verified_by := (select auth.uid());
    new.verified_at := private.audit_now();
  else
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_certificate_verified() from public;

create trigger stamp_certificate_verified
  before insert or update of verified_by, verified_at on public.certificates
  for each row execute function private.stamp_certificate_verified();

select private.enable_household_rls('public.certificates', 'member');
select private.enable_audit('public.certificates');
select private.enable_household_rls('public.parcels', 'member');
select private.enable_audit('public.parcels');
select private.enable_household_rls('public.structures', 'member');
select private.enable_audit('public.structures');
