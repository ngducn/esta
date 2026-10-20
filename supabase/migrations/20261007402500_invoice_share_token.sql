-- LSE-11: a reminder links to its bill's QR picture at /q/<share_token>, which the tenant opens without signing in.
-- An issued bill holds an unguessable token, 128 random bits as 22 base64url characters. A draft holds none, and a
-- void clears it, so an old link stops working the moment Mẹ voids the bill.

create function private.new_share_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_');
$$;
revoke all on function private.new_share_token() from public;

alter table public.invoices add column share_token text unique check (share_token ~ '^[A-Za-z0-9_-]{22}$');

-- Every writer issues or voids through a status change (the nightly job, activation, issue_invoice_now, void_invoice,
-- the seed), so the token follows status here rather than in each of them.
create function private.share_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.share_token := case when new.status = 'issued' then coalesce(new.share_token, private.new_share_token()) end;
  return new;
end;
$$;
revoke all on function private.share_invoice() from public;

create trigger share_invoice
  before insert or update on public.invoices
  for each row execute function private.share_invoice();

-- Bills issued before this migration. freeze_issued_invoice refuses any change to an issued bill, so it steps aside
-- for this one write.
alter table public.invoices disable trigger freeze_issued_invoice;
update public.invoices set share_token = private.new_share_token() where status = 'issued' and share_token is null;
alter table public.invoices enable trigger freeze_issued_invoice;

alter table public.invoices add constraint invoices_share_token_issued check ((status = 'issued') = (share_token is not null));

-- What /q/<token> draws: the household's default receiving account, the amount still owed and the memo code of one
-- issued bill. Nothing names the tenant, the property or the household. Granted to anon, because the tenant has no
-- account; a malformed token is refused before the lookup.
create function public.invoice_qr_by_token(p_token text)
returns table (bank_bin text, bank_name text, account_no text, account_name text, outstanding_vnd bigint, memo_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.bank_bin, coalesce(bin.short_name, bin.name), a.account_no, a.account_name, b.outstanding_vnd, i.memo_code
  from public.invoices i
  join public.invoice_balances b on b.id = i.id
  join public.bank_accounts a on a.household_id = i.household_id and a.is_default
  join public.bank_bins bin on bin.bin = a.bank_bin
  where p_token ~ '^[A-Za-z0-9_-]{22}$' and i.share_token = p_token and i.status = 'issued';
$$;
revoke all on function public.invoice_qr_by_token(text) from public;
grant execute on function public.invoice_qr_by_token(text) to anon, authenticated;
