create extension if not exists postgis with schema extensions;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  nickname text not null check (btrim(nickname) <> ''),
  code text not null check (code ~ '^[A-Z0-9]{1,12}$'),
  kind text not null check (kind in (
    'townhouse', 'apartment', 'villa', 'rooming_house', 'commercial_space', 'warehouse',
    'residential_land', 'agricultural_land', 'mixed', 'other')),
  kind_details jsonb not null default '{}' check (jsonb_typeof(kind_details) = 'object'),
  use_mode text not null check (use_mode in (
    'rental', 'owner_occupied', 'family_use', 'own_business', 'held', 'under_renovation')),
  legal_status text not null default 'unknown' check (legal_status in (
    'certified', 'certificate_pending', 'paper_only', 'shared_certificate', 'in_dispute', 'unknown')),
  -- Codes are admin_units codes; the foreign key waits until admin_units exists on this branch's base.
  current_address jsonb check (
    jsonb_typeof(current_address) = 'object'
    and coalesce(current_address ->> 'commune_code', '00000') ~ '^[0-9]{5}$'
    and coalesce(current_address ->> 'province_code', '00') ~ '^[0-9]{2}$'),
  certificate_address_text text,
  location extensions.geography(point, 4326),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, code)
);

select private.enable_household_rls('public.properties', 'member');
select private.enable_audit('public.properties');
