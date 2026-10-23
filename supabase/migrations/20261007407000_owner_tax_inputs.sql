-- What an owner earns outside rentals in a year (SPEC §5.4 owner_tax_inputs, FIN-3). The 500,000,000 VND threshold
-- tests the person's whole business revenue, so the tax card adds this to projected rental revenue (DOMAIN-VN §5).

create table public.owner_tax_inputs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  party_id uuid not null,
  year smallint not null check (year between 2000 and 2100),
  -- [app rule] The same ceiling as every other stored amount.
  other_business_revenue_vnd bigint not null default 0 check (other_business_revenue_vnd between 0 and 1000000000000),
  notes text check (btrim(notes) <> '' and char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, party_id, year),
  foreign key (household_id, party_id) references public.parties (household_id, id) on delete cascade
);

select private.enable_household_rls('public.owner_tax_inputs', 'member');
select private.enable_audit('public.owner_tax_inputs');
