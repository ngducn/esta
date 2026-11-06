-- Statement import invariants (#255, #266): a line is stored once per account even when two previews race, a bill that a
-- line names must be the one its memo names, a hand transfer into another account never holds a line, and an imported
-- payment has a way back.

comment on index public.statement_rows_fingerprint_key is
  'One stored line per household and fingerprint. It leaves out only in-file repeats (reason duplicate), so an ignored debit is covered too; a same-reference repeat is always a duplicate.';

-- The hand transfers a line may be: now also only those received into the import's account, or into none (a transfer
-- recorded without one), so linking never leaves a payment and its line in different accounts.
create or replace function private.statement_line_candidates(p_row public.statement_rows)
returns table (payment_id uuid, received_on date, amount_vnd bigint)
language sql
stable
set search_path = ''
as $$
  select p.id, p.received_on, p.amount_vnd
  from public.payments p
  where p_row.invoice_id is not null and p_row.status in ('memo_match', 'suggested')
    and p.household_id = p_row.household_id and p.source = 'manual' and p.method = 'bank_transfer' and p.statement_row_id is null
    and p.amount_vnd = p_row.amount_vnd and p.received_on - p_row.posted_on between -2 and 10
    and (p.bank_account_id is null or p.bank_account_id = (select i.bank_account_id from public.statement_imports i where i.id = p_row.import_id))
    and exists (
      select from public.payment_allocations a
      join public.invoices i on i.id = a.invoice_id
      where a.payment_id = p.id and i.lease_id = (select b.lease_id from public.invoices b where b.id = p_row.invoice_id)
    )
  order by abs(p.received_on - p_row.posted_on), p.received_on, p.id;
$$;

-- A description as core's `normalizeDescription` reads it (twin: packages/core/src/matching/memo.ts, vectors in
-- supabase/tests/fixtures/statement_text.csv): lower case, đ and ð as d, diacritics dropped, then A to Z and 0 to 9 only,
-- upper case. Not `public.esta_unaccent`, which also folds ß, æ, ø and ł to letters that core drops.
create function private.statement_text_key(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select upper(regexp_replace(translate(normalize(lower(p_text), NFD), 'đð', 'dd'), '[^a-z0-9]', '', 'g'));
$$;

-- `Xem trước`, with three guards the caller's planning cannot give (#266). The account's row is locked, so two previews
-- of one statement take turns and the second sees the first's lines. A postable line the account already holds is left
-- out, as core's `knownLines` leaves it out when it plans (the one rule, here under the lock for every line): the same
-- amount and, if both carry a bank reference, the same reference within 14 days (KNOWN_REFERENCE_WINDOW_DAYS), otherwise
-- the same description key within 3 days (KNOWN_WINDOW_DAYS). Each held line answers for one new line, so two identical
-- counter deposits stay two. And a memo match names its bill: the description holds ESTA and that bill's memo code.
create or replace function public.create_statement_import(
  p_import_id uuid,
  p_bank_account_id uuid,
  p_file_name text,
  p_column_mapping jsonb,
  p_rejected jsonb,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select b.household_id into v_household from public.bank_accounts b
  where b.id = p_bank_account_id and private.is_member(b.household_id, 'admin')
  for update;
  if not found then
    raise exception 'ESTA_BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('statement_import:' || p_bank_account_id::text, 0));
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'ESTA_STATEMENT_ROWS' using errcode = '22023';
  end if;
  if exists (
    select from jsonb_to_recordset(p_rows) r (description text, status text, invoice_id uuid)
    where r.status = 'memo_match' and not exists (
      select from public.invoices i
      where i.id = r.invoice_id and i.household_id = v_household
        and private.statement_text_key(coalesce(r.description, '')) like '%ESTA' || i.memo_code || '%'
    )
  ) then
    raise exception 'ESTA_STATEMENT_ROWS' using errcode = '22023';
  end if;
  insert into public.statement_imports (id, household_id, bank_account_id, file_name, column_mapping, rejected)
  values (p_import_id, v_household, p_bank_account_id, p_file_name, p_column_mapping, p_rejected);
  insert into public.statement_rows (
    household_id, import_id, row_index, posted_on, amount_vnd, description, bank_ref, fingerprint, status, reason, invoice_id, candidate_invoice_ids
  )
  select v_household, p_import_id, r.row_index, r.posted_on, r.amount_vnd, r.description, coalesce(r.bank_ref, ''), r.fingerprint, r.status, r.reason,
    r.invoice_id, coalesce(r.candidate_invoice_ids, '{}')
  from (
    select n.*, private.statement_text_key(coalesce(n.description, '')) as text_key,
      row_number() over (partition by n.amount_vnd, private.statement_text_key(coalesce(n.description, '')) order by n.row_index) as nth
    from jsonb_to_recordset(p_rows) n (
      row_index integer, posted_on date, amount_vnd bigint, description text, bank_ref text, fingerprint text, status text, reason text,
      invoice_id uuid, candidate_invoice_ids uuid[]
    )
  ) r
  cross join lateral (
    select
      count(*) filter (where coalesce(r.bank_ref, '') <> '' and o.bank_ref <> '' and o.bank_ref = r.bank_ref) as by_reference,
      count(*) filter (
        where (coalesce(r.bank_ref, '') = '' or o.bank_ref = '') and abs(o.posted_on - r.posted_on) <= 3
          and private.statement_text_key(coalesce(o.description, '')) = r.text_key
      ) as by_description
    from public.statement_rows o
    join public.statement_imports oi on oi.id = o.import_id
    where oi.bank_account_id = p_bank_account_id and o.household_id = v_household and o.reason is distinct from 'duplicate'
      and o.amount_vnd = r.amount_vnd and abs(o.posted_on - r.posted_on) <= 14
  ) held
  where r.status = 'ignored' or (held.by_reference = 0 and r.nth > held.by_description)
  on conflict (household_id, fingerprint) where reason is distinct from 'duplicate' do nothing;
  if exists (
    select from public.statement_rows r
    where r.import_id = p_import_id and r.status in ('memo_match', 'suggested') and r.posted_on > private.business_date(private.audit_now())
  ) then
    raise exception 'ESTA_STATEMENT_ROWS' using errcode = '22023';
  end if;
  return p_import_id;
end;
$$;

-- `Hoàn tác` on a committed import, or on some of its lines (#255): each posted line returns to unposted. A payment the
-- import made is deleted with its allocations; a hand transfer an admin linked to a line is kept and only unlinked. The
-- import lock and then the lease locks are commit's, in the same order. An import with no posted line reads `parsed`
-- again. Returns how many lines were unposted; a repeat returns 0.
create function public.undo_statement_import(p_import_id uuid, p_row_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.statement_imports;
  v_row record;
  v_changed integer;
  v_undone integer := 0;
begin
  select * into v_import from public.statement_imports s
  where s.id = p_import_id and private.is_member(s.household_id, 'admin')
  for update;
  if not found then
    raise exception 'ESTA_IMPORT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_row_ids is not null and exists (
    select from unnest(p_row_ids) asked (id) where not exists (select from public.statement_rows r where r.id = asked.id and r.import_id = p_import_id)
  ) then
    raise exception 'ESTA_STATEMENT_LINE_NOT_FOUND' using errcode = 'P0002';
  end if;
  for v_row in
    select r.id, r.invoice_id from public.statement_rows r
    where r.import_id = p_import_id and r.invoice_id is not null and (p_row_ids is null or r.id = any (p_row_ids))
    order by r.row_index
  loop
    perform 1 from public.invoices i join public.leases l on l.id = i.lease_id where i.id = v_row.invoice_id for no key update of l;
    update public.payments p set statement_row_id = null where p.statement_row_id = v_row.id and p.source = 'manual';
    get diagnostics v_changed = row_count;
    v_undone := v_undone + v_changed;
    delete from public.payments p where p.statement_row_id = v_row.id and p.source = 'statement_import';
    get diagnostics v_changed = row_count;
    v_undone := v_undone + v_changed;
  end loop;
  if v_import.status = 'committed' and not exists (
    select from public.payments p join public.statement_rows r on r.id = p.statement_row_id where r.import_id = p_import_id
  ) then
    update public.statement_imports s set status = 'parsed', committed_at = null where s.id = p_import_id;
  end if;
  return v_undone;
end;
$$;
revoke all on function public.undo_statement_import(uuid, uuid[]) from public, anon;
grant execute on function public.undo_statement_import(uuid, uuid[]) to authenticated;
