-- Receiving accounts in Cài đặt (PLT-1): an admin picks which account every bill's QR pays into, and removes an account
-- the money history never named.

-- The one way to move the default. A single UPDATE that flips two rows can trip the partial unique index on its row
-- order, so this clears then sets, holding every account of the household so two admins cannot interleave and the
-- picked account cannot vanish between the check and the set.
create function public.set_default_bank_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_is_default boolean;
  v_set int;
begin
  select a.household_id into v_household from public.bank_accounts a where a.id = p_id and private.is_member(a.household_id, 'viewer');
  if v_household is null then
    raise exception 'ESTA_BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.is_member(v_household, 'admin') then
    raise exception 'ESTA_BANK_ACCOUNT_ADMIN_ONLY' using errcode = '42501';
  end if;
  perform 1 from public.bank_accounts a where a.household_id = v_household order by a.id for update;
  select a.is_default into v_is_default from public.bank_accounts a where a.id = p_id;
  if v_is_default is null then
    raise exception 'ESTA_BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_is_default then
    return;
  end if;
  update public.bank_accounts a set is_default = false where a.household_id = v_household and a.is_default;
  update public.bank_accounts a set is_default = true where a.id = p_id;
  get diagnostics v_set = row_count;
  if v_set = 0 then
    raise exception 'ESTA_BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.set_default_bank_account(uuid) from public, anon;
grant execute on function public.set_default_bank_account(uuid) to authenticated;

-- Bills pay into the default, so it goes only when its household goes: a cascade from the household runs after the
-- household row is gone.
create function private.keep_default_bank_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.households h where h.id = old.household_id) then
    raise exception 'ESTA_BANK_ACCOUNT_IS_DEFAULT' using errcode = '23001';
  end if;
  return old;
end;
$$;
revoke all on function private.keep_default_bank_account() from public;
create trigger bank_accounts_keep_default
  before delete on public.bank_accounts
  for each row when (old.is_default)
  execute function private.keep_default_bank_account();

-- A payment or a statement says which account the money landed in, so that account keeps its bank and number; the
-- holder name may still be corrected. Receiving into another number means adding an account.
create function private.keep_named_bank_account_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.payments p where p.bank_account_id = old.id)
     or exists (select 1 from public.statement_imports s where s.household_id = old.household_id and s.bank_account_id = old.id) then
    raise exception 'ESTA_BANK_ACCOUNT_NUMBER_LOCKED' using errcode = '23001';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_named_bank_account_number() from public;
create trigger bank_accounts_keep_named_number
  before update of bank_bin, account_no on public.bank_accounts
  for each row when ((old.bank_bin, old.account_no) is distinct from (new.bank_bin, new.account_no))
  execute function private.keep_named_bank_account_number();

alter table public.payments
  drop constraint payments_bank_account_fkey,
  add constraint payments_bank_account_fkey foreign key (household_id, bank_account_id) references public.bank_accounts (household_id, id);
