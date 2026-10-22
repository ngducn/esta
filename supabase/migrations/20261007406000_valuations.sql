-- Valuations per property (SPEC §5.3, FIN-5): estimates Mẹ records with their date, method and source. Always shown as
-- an estimate. No soft delete: deleting removes the row, and `Hoàn tác` writes it again under the same id. The key
-- carries the household, so a valuation never points at another household's property.

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  as_of date not null,
  -- [app rule] The ceiling of every stored amount (MAX_AMOUNT_VND).
  value_vnd bigint not null check (value_vnd between 1 and 1000000000000),
  method text not null check (method in ('owner_estimate', 'broker_quote', 'state_price_reference', 'comparables')),
  source_url text check (source_url ~ '^https://[^[:space:]]+$' and char_length(source_url) <= 2000),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade
);
create index valuations_household_property_as_of_idx on public.valuations (household_id, property_id, as_of desc);

select private.enable_household_rls('public.valuations', 'member');
select private.enable_audit('public.valuations');
