-- Expenses per property (SPEC §5.4, FIN-1). Soft delete: deleting an expense sets deleted_at, so `Hoàn tác` brings it
-- back. A vendor or receipt of another household cannot be linked, because the keys carry the household.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  category text not null check (category in (
    'repair', 'maintenance', 'land_tax', 'rental_tax', 'utility', 'management_fee', 'insurance', 'broker_fee', 'legal', 'other')),
  -- [app rule] The ceiling of payments and rents.
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  paid_on date not null,
  vendor_party_id uuid,
  document_id uuid,
  note text check (char_length(note) <= 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  foreign key (household_id, vendor_party_id) references public.parties (household_id, id) on delete set null (vendor_party_id),
  foreign key (household_id, document_id) references public.documents (household_id, id) on delete set null (document_id)
);
create index expenses_household_property_paid_idx on public.expenses (household_id, property_id, paid_on desc) where deleted_at is null;

select private.enable_household_rls('public.expenses', 'member');
select private.enable_audit('public.expenses');
select private.enable_soft_delete('public.expenses');
