-- Bank statement import (SPEC §5.4 statement_imports and statement_rows, LSE-8). The browser reads the file, the server
-- matches its rows with packages/core matchRows and stores them through create_statement_import, and
-- commit_statement_import posts the memo matches and the lines an admin confirmed, in one transaction. What a line can
-- do now (post, wait for a person, already posted) is private.statement_line_state, read by the preview and the
-- commit alike. A statement shows every movement of the account, so only an admin reads or writes these rows.

create table public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  bank_account_id uuid not null,
  file_name text not null check (btrim(file_name) <> '' and char_length(file_name) <= 255),
  -- The header the rows were read under, as the next import from this account will look for it.
  column_mapping jsonb not null check (jsonb_typeof(column_mapping) = 'object'),
  -- Lines of the file that could not be read, with the reason: { index, field, reason }.
  rejected jsonb not null default '[]' check (jsonb_typeof(rejected) = 'array'),
  status text not null default 'parsed' check (status in ('parsed', 'committed')),
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  check ((status = 'committed') = (committed_at is not null)),
  foreign key (household_id, bank_account_id) references public.bank_accounts (household_id, id)
);
create index statement_imports_account_idx on public.statement_imports (household_id, bank_account_id, created_at desc);

-- One line of a statement, as matching found it; a stored line never changes. `fingerprint` is the #58 contract
-- (packages/core identifyRows).
-- A line the file repeats under the same bank reference shares its first copy's fingerprint and is stored `ignored`
-- with reason `duplicate`, so the unique key covers every other row: a transfer is stored once per household.
create table public.statement_rows (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  import_id uuid not null,
  -- Zero-based line of the file, as the decoder numbers it.
  row_index integer not null check (row_index between 0 and 100000),
  posted_on date not null,
  -- Money in is positive, money out negative.
  amount_vnd bigint not null check (abs(amount_vnd) <= 1000000000000),
  description text not null check (char_length(description) <= 1000),
  bank_ref text not null default '' check (char_length(bank_ref) <= 200),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('memo_match', 'suggested', 'unmatched', 'ignored')),
  -- Why a row is ignored (a debit, a repeat of an earlier line) or left for a person (a repeat without a reference).
  reason text,
  invoice_id uuid,
  candidate_invoice_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (import_id, row_index),
  foreign key (household_id, import_id) references public.statement_imports (household_id, id) on delete cascade,
  foreign key (household_id, invoice_id) references public.invoices (household_id, id),
  check (status = 'ignored' or amount_vnd > 0),
  check (
    case status
      when 'ignored' then invoice_id is null and reason in ('debit', 'duplicate')
      when 'unmatched' then invoice_id is null and (reason is null or reason = 'repeat')
      else invoice_id is not null and reason is null
    end
  )
);
create unique index statement_rows_fingerprint_key on public.statement_rows (household_id, fingerprint)
  where reason is distinct from 'duplicate';
create index statement_rows_invoice_idx on public.statement_rows (invoice_id) where invoice_id is not null;

select private.enable_household_rls('public.statement_imports', 'admin');
select private.enable_audit('public.statement_imports');
select private.enable_household_rls('public.statement_rows', 'admin');
select private.enable_audit('public.statement_rows');

revoke insert, update, delete on table public.statement_imports, public.statement_rows from authenticated;
drop policy statement_imports_insert on public.statement_imports;
drop policy statement_imports_update on public.statement_imports;
drop policy statement_imports_delete on public.statement_imports;
drop policy statement_rows_insert on public.statement_rows;
drop policy statement_rows_update on public.statement_rows;
drop policy statement_rows_delete on public.statement_rows;
drop policy statement_imports_select on public.statement_imports;
drop policy statement_rows_select on public.statement_rows;
create policy statement_imports_select on public.statement_imports for select to authenticated
  using (private.is_member(household_id, 'admin'));
create policy statement_rows_select on public.statement_rows for select to authenticated
  using (private.is_member(household_id, 'admin'));

-- The statement line a payment was posted from, or the line an admin said a transfer recorded by hand came in on. A
-- line holds at most one payment.
alter table public.payments add column statement_row_id uuid;
alter table public.payments
  add constraint payments_statement_row_fkey foreign key (household_id, statement_row_id)
    references public.statement_rows (household_id, id),
  add constraint payments_statement_row_key unique (statement_row_id),
  add constraint payments_statement_row_source check (
    statement_row_id is null or source = 'statement_import' or (source = 'manual' and method = 'bank_transfer')
  );

-- The one allocation every payment writer runs (LSE-7): what the payment brought settles the lease's issued invoices
-- still owed, oldest due first, or only p_invoice_ids when the member chose. p_first_invoice_id goes ahead of that order,
-- for a statement line whose memo names its bill. What is left is the tenant's credit. The caller holds the lease lock.
create function private.allocate_payment(p_payment_id uuid, p_lease_id uuid, p_invoice_ids uuid[], p_first_invoice_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_left bigint;
  v_open record;
  v_part bigint;
begin
  select * into v_payment from public.payments p where p.id = p_payment_id;
  v_left := v_payment.amount_vnd;
  for v_open in
    select b.id, b.outstanding_vnd from public.invoice_balances b
    where b.lease_id = p_lease_id and b.status = 'issued' and b.outstanding_vnd > 0
      and (p_invoice_ids is null or b.id = any (p_invoice_ids))
    order by b.id is distinct from p_first_invoice_id, b.due_date, b.period_start, b.id
  loop
    exit when v_left = 0;
    v_part := least(v_left, v_open.outstanding_vnd);
    insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
    values (v_payment.household_id, p_payment_id, v_open.id, v_part);
    v_left := v_left - v_part;
  end loop;
end;
$$;
revoke all on function private.allocate_payment(uuid, uuid, uuid[], uuid) from public;

-- The 20261007402400 writer, its allocation loop now private.allocate_payment. Signature, refusals, locks and
-- idempotency are unchanged.
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_owed_vnd bigint,
  p_amount_vnd bigint,
  p_method text,
  p_received_on date,
  p_idempotency_key uuid,
  p_invoice_ids uuid[] default null,
  p_bank_account_id uuid default null
)
returns table (id uuid, amount_vnd bigint, allocated_vnd bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_lease public.leases;
  v_row record;
  v_payment uuid;
begin
  -- The lease lock makes two payments of one lease take turns, so neither allocates what the other already settled.
  select l.* into v_lease
  from public.invoices i
  join public.leases l on l.id = i.lease_id
  where i.id = p_invoice_id and i.status = 'issued' and private.is_member(i.household_id, 'member')
  for no key update of l;
  if not found then
    raise exception 'ESTA_INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select p.id into v_payment from public.payments p
  where p.household_id = v_lease.household_id and p.idempotency_key = p_idempotency_key;
  if not found then
    if p_idempotency_key is null then
      raise exception 'ESTA_PAYMENT_KEY_MISSING' using errcode = '22023';
    end if;
    if p_method is null or p_method not in ('cash', 'bank_transfer') then
      raise exception 'ESTA_PAYMENT_METHOD' using errcode = '22023';
    end if;
    if p_bank_account_id is not null and (
      p_method <> 'bank_transfer'
      or not exists (select from public.bank_accounts b where b.id = p_bank_account_id and b.household_id = v_lease.household_id)
    ) then
      raise exception 'ESTA_PAYMENT_ACCOUNT' using errcode = '22023';
    end if;
    if p_received_on is null or p_received_on > private.business_date(private.audit_now()) then
      raise exception 'ESTA_PAYMENT_DATE_AFTER_TODAY' using errcode = '22023';
    end if;
    if p_invoice_ids is not null and (
      cardinality(p_invoice_ids) = 0
      or exists (
        select from unnest(p_invoice_ids) chosen (invoice_id)
        where not exists (
          select from public.invoice_balances b
          where b.id = chosen.invoice_id and b.lease_id = v_lease.id and b.status = 'issued'
        )
      )
    ) then
      raise exception 'ESTA_ALLOCATION_CHOICE' using errcode = '23514';
    end if;
    if not exists (select from public.invoice_balances b where b.lease_id = v_lease.id and b.status = 'issued' and b.outstanding_vnd > 0) then
      raise exception 'ESTA_NOTHING_OWED' using errcode = '23514';
    end if;
    select b.id, b.due_date, b.period_start into v_row from public.invoice_balances b where b.id = p_invoice_id;
    if exists (
      select from public.invoice_balances b
      where b.outstanding_vnd <= 0 and ((p_invoice_ids is null and b.id = p_invoice_id) or b.id = any (p_invoice_ids))
    ) or p_owed_vnd is distinct from (
      select coalesce(sum(b.outstanding_vnd), 0) from public.invoice_balances b
      where b.lease_id = v_lease.id and b.status = 'issued' and b.outstanding_vnd > 0
        and case when p_invoice_ids is null
          then (b.due_date, b.period_start, b.id) <= (v_row.due_date, v_row.period_start, v_row.id)
          else b.id = any (p_invoice_ids) end
    ) then
      raise exception 'ESTA_PAYMENT_STALE' using errcode = '23514';
    end if;

    insert into public.payments (household_id, payer_party_id, amount_vnd, received_on, method, source, idempotency_key, bank_account_id)
    values (v_lease.household_id, v_lease.tenant_party_id, p_amount_vnd, p_received_on, p_method, 'manual', p_idempotency_key, p_bank_account_id)
    returning payments.id into v_payment;
    perform private.allocate_payment(v_payment, v_lease.id, p_invoice_ids, null);
  end if;

  return query
    select p.id, p.amount_vnd, coalesce((select sum(a.amount_vnd) from public.payment_allocations a where a.payment_id = p.id), 0)::bigint
    from public.payments p
    where p.id = v_payment;
end;
$$;

-- What a line can do now (LSE-8, [app rule] DOMAIN-VN §9): `posted` once a payment holds it, with `recorded_by_hand`
-- when that payment was recorded by hand and linked; a memo naming a voided bill, or one that owes nothing, is
-- `unmatched` with `void` or `paid`. A memo match on a bill that has a transfer recorded by hand (source manual, method
-- bank_transfer) that no statement line holds yet is `held` with `recorded_by_hand`, because the line may be that same
-- transfer: it posts only when an admin confirms it, or is linked to that payment. `link_payment_id` is the one such
-- transfer of the same amount, when there is exactly one; `hand_*` describe the transfer shown beside the line.
create function private.statement_line_state(
  p_row public.statement_rows,
  out state text,
  out reason text,
  out link_payment_id uuid,
  out hand_received_on date,
  out hand_amount_vnd bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_source text;
  v_bill record;
begin
  select p.source into v_source from public.payments p where p.statement_row_id = p_row.id;
  if found then
    state := 'posted';
    reason := case when v_source = 'manual' then 'recorded_by_hand' end;
    return;
  end if;
  state := p_row.status;
  reason := p_row.reason;
  if p_row.invoice_id is null then
    return;
  end if;
  select b.status, b.outstanding_vnd into v_bill from public.invoice_balances b where b.id = p_row.invoice_id;
  if v_bill.status <> 'issued' then
    state := 'unmatched';
    reason := 'void';
    return;
  end if;
  if p_row.status = 'memo_match' then
    select p.received_on, p.amount_vnd into hand_received_on, hand_amount_vnd
    from public.payments p
    where p.household_id = p_row.household_id and p.source = 'manual' and p.method = 'bank_transfer' and p.statement_row_id is null
      and exists (select from public.payment_allocations a where a.payment_id = p.id and a.invoice_id = p_row.invoice_id)
    order by p.amount_vnd = p_row.amount_vnd desc, p.received_on desc, p.id
    limit 1;
    if found then
      state := 'held';
      reason := 'recorded_by_hand';
      select min(p.id::text)::uuid into link_payment_id
      from public.payments p
      where p.household_id = p_row.household_id and p.source = 'manual' and p.method = 'bank_transfer' and p.statement_row_id is null
        and p.amount_vnd = p_row.amount_vnd
        and exists (select from public.payment_allocations a where a.payment_id = p.id and a.invoice_id = p_row.invoice_id)
      having count(*) = 1;
      return;
    end if;
  end if;
  if v_bill.outstanding_vnd <= 0 then
    state := 'unmatched';
    reason := 'paid';
  end if;
end;
$$;
revoke all on function private.statement_line_state(public.statement_rows) from public;
grant execute on function private.statement_line_state(public.statement_rows) to authenticated;

-- The preview: each line of an import in file order with its state, under the reader's RLS.
create function public.statement_import_lines(p_import_id uuid)
returns table (
  id uuid, row_index integer, posted_on date, amount_vnd bigint, description text, bank_ref text, state text, reason text,
  invoice_id uuid, candidate_invoice_ids uuid[], link_payment_id uuid, hand_received_on date, hand_amount_vnd bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id, r.row_index, r.posted_on, r.amount_vnd, r.description, r.bank_ref, s.state, s.reason, r.invoice_id, r.candidate_invoice_ids,
    s.link_payment_id, s.hand_received_on, s.hand_amount_vnd
  from public.statement_rows r
  cross join lateral private.statement_line_state(r) s
  where r.import_id = p_import_id
  order by r.row_index;
$$;
revoke all on function public.statement_import_lines(uuid) from public, anon;
grant execute on function public.statement_import_lines(uuid) to authenticated;

-- `Xem trước`: the import and its matched rows, as the server's matchRows decided them. p_import_id is minted by the
-- caller, so a repeated request finds the import it made. A row a concurrent import already stored is left out.
create function public.create_statement_import(
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
  where b.id = p_bank_account_id and private.is_member(b.household_id, 'admin');
  if not found then
    raise exception 'ESTA_BANK_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'ESTA_STATEMENT_ROWS' using errcode = '22023';
  end if;
  insert into public.statement_imports (id, household_id, bank_account_id, file_name, column_mapping, rejected)
  values (p_import_id, v_household, p_bank_account_id, p_file_name, p_column_mapping, p_rejected);
  insert into public.statement_rows (
    household_id, import_id, row_index, posted_on, amount_vnd, description, bank_ref, fingerprint, status, reason, invoice_id, candidate_invoice_ids
  )
  select v_household, p_import_id, r.row_index, r.posted_on, r.amount_vnd, r.description, coalesce(r.bank_ref, ''), r.fingerprint, r.status, r.reason,
    r.invoice_id, coalesce(r.candidate_invoice_ids, '{}')
  from jsonb_to_recordset(p_rows) r (
    row_index integer, posted_on date, amount_vnd bigint, description text, bank_ref text, fingerprint text, status text, reason text,
    invoice_id uuid, candidate_invoice_ids uuid[]
  )
  on conflict (household_id, fingerprint) where reason is distinct from 'duplicate' do nothing;
  -- Only a line dated on or before the database clock's date may post.
  if exists (
    select from public.statement_rows r
    where r.import_id = p_import_id and r.status in ('memo_match', 'suggested') and r.posted_on > private.business_date(private.audit_now())
  ) then
    raise exception 'ESTA_STATEMENT_ROWS' using errcode = '22023';
  end if;
  return p_import_id;
end;
$$;
revoke all on function public.create_statement_import(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_statement_import(uuid, uuid, text, jsonb, jsonb, jsonb) to authenticated;

-- `Ghi sổ` (LSE-8, SPEC §7.4): every line whose state is `memo_match`, and every `suggested` or `held` line in
-- p_confirmed_row_ids, posts one bank transfer into the import's account, to its bill first and the rest by
-- private.allocate_payment's order, and the import is committed. The lease lock is record_payment's, so a payment of
-- the same lease in flight lands before the line's state is read. A posted line never posts again: the import lock
-- makes two commits take turns, and a line's payment makes it `posted`. skipped_count is the lines asked for that did
-- not post (held, paid or void), counting the memo matches only on the first commit.
create function public.commit_statement_import(p_import_id uuid, p_confirmed_row_ids uuid[] default '{}')
returns table (posted_count integer, skipped_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.statement_imports;
  v_row public.statement_rows;
  v_lease public.leases;
  v_state record;
  v_wanted boolean;
  v_payment uuid;
  v_posted integer := 0;
  v_skipped integer := 0;
begin
  select * into v_import from public.statement_imports s
  where s.id = p_import_id and private.is_member(s.household_id, 'admin')
  for update;
  if not found then
    raise exception 'ESTA_IMPORT_NOT_FOUND' using errcode = 'P0002';
  end if;
  for v_row in
    select * from public.statement_rows r
    where r.import_id = p_import_id and r.invoice_id is not null
    order by r.row_index
  loop
    v_wanted := v_row.id = any (coalesce(p_confirmed_row_ids, '{}'));
    continue when v_row.status <> 'memo_match' and not v_wanted;
    select l.* into v_lease from public.invoices i join public.leases l on l.id = i.lease_id
    where i.id = v_row.invoice_id
    for no key update of l;
    v_state := private.statement_line_state(v_row);
    if v_state.state = 'memo_match' or (v_wanted and v_state.state in ('suggested', 'held')) then
      insert into public.payments (
        household_id, payer_party_id, amount_vnd, received_on, method, bank_ref, memo, source, bank_account_id, statement_row_id
      )
      values (
        v_import.household_id, v_lease.tenant_party_id, v_row.amount_vnd, v_row.posted_on, 'bank_transfer', nullif(btrim(v_row.bank_ref), ''),
        nullif(btrim(left(v_row.description, 500)), ''), 'statement_import', v_import.bank_account_id, v_row.id
      )
      returning id into v_payment;
      perform private.allocate_payment(v_payment, v_lease.id, null, v_row.invoice_id);
      v_posted := v_posted + 1;
    elsif v_state.state <> 'posted' and (v_wanted or v_import.status = 'parsed') then
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  update public.statement_imports s set status = 'committed', committed_at = private.audit_now()
  where s.id = p_import_id and s.status = 'parsed';
  return query select v_posted, v_skipped;
end;
$$;
revoke all on function public.commit_statement_import(uuid, uuid[]) from public, anon;
grant execute on function public.commit_statement_import(uuid, uuid[]) to authenticated;

-- `Đã ghi tay`: a held line is the transfer recorded by hand, so that payment takes the line and no money is added. Only
-- the one transfer of the line's amount private.statement_line_state names can be linked; linking it again changes
-- nothing.
create function public.link_statement_line(p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.statement_rows;
  v_state record;
begin
  select r.* into v_row from public.statement_rows r where r.id = p_row_id and private.is_member(r.household_id, 'admin');
  if not found then
    raise exception 'ESTA_STATEMENT_LINE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform 1 from public.statement_imports s where s.id = v_row.import_id for update;
  perform 1 from public.invoices i join public.leases l on l.id = i.lease_id where i.id = v_row.invoice_id for no key update of l;
  v_state := private.statement_line_state(v_row);
  if v_state.state = 'posted' and v_state.reason = 'recorded_by_hand' then
    return;
  end if;
  if v_state.state <> 'held' or v_state.link_payment_id is null then
    raise exception 'ESTA_STATEMENT_LINE_NOT_LINKABLE' using errcode = '55000';
  end if;
  update public.payments p set statement_row_id = v_row.id where p.id = v_state.link_payment_id;
end;
$$;
revoke all on function public.link_statement_line(uuid) from public, anon;
grant execute on function public.link_statement_line(uuid) to authenticated;
