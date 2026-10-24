-- Receiving accounts in Cài đặt (PLT-1): an admin picks which account every bill's QR pays into, and removes an account
-- the money history never named.

-- The one way to move the default. A single UPDATE that flips two rows can trip the partial unique index on its row
-- order, so this clears then sets, holding every account of the household so two admins cannot interleave.
create function public.set_default_bank_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select a.household_id into v_household from public.bank_accounts a where a.id = p_id and private.is_member(a.household_id, 'viewer');
  if v_household is null then
    raise exception 'ESTA_BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.is_member(v_household, 'admin') then
    raise exception 'ESTA_BANK_ACCOUNT_ADMIN_ONLY' using errcode = '42501';
  end if;
  perform 1 from public.bank_accounts a where a.household_id = v_household order by a.id for update;
  update public.bank_accounts a set is_default = false where a.household_id = v_household and a.is_default and a.id <> p_id;
  update public.bank_accounts a set is_default = true where a.id = p_id and not a.is_default;
end;
$$;
revoke all on function public.set_default_bank_account(uuid) from public, anon;
grant execute on function public.set_default_bank_account(uuid) to authenticated;

-- A payment keeps the account it landed in: removing that account is refused, as statement_imports already refuses it.
alter table public.payments
  drop constraint payments_bank_account_fkey,
  add constraint payments_bank_account_fkey foreign key (household_id, bank_account_id) references public.bank_accounts (household_id, id);
