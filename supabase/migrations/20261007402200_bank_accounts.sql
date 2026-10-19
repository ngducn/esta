-- Receiving accounts for VietQR (SPEC §5.4 bank_accounts, LSE-5). An invoice's QR pays into the household's default
-- account. Where rent lands is the household's decision, so only an admin adds or changes an account.

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  bank_bin text not null references public.bank_bins (bin),
  -- VietQR tag 38 sub-tag 01 holds at most 19 characters (DOMAIN-VN §10).
  account_no text not null check (account_no ~ '^[0-9A-Z]{1,19}$'),
  -- [app rule] The name as the bank prints it: printable ASCII with no lowercase letter, as packages/core ASCII_UPPERCASE.
  account_name text not null check (account_name ~ '^[\x20-\x60\x7B-\x7E]{1,50}$' and btrim(account_name) = account_name and account_name <> ''),
  owner_party_id uuid,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, bank_bin, account_no),
  foreign key (household_id, owner_party_id) references public.parties (household_id, id) on delete set null (owner_party_id)
);
create unique index bank_accounts_one_default_idx on public.bank_accounts (household_id) where is_default;

select private.enable_household_rls('public.bank_accounts', 'admin');
select private.enable_audit('public.bank_accounts');
