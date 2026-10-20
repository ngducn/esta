-- LSE-5 manual issue and void, and where a transfer landed (PLT-1's receiving account). A member issues a draft before
-- its day with issue_invoice_now, voids an issued bill with a reason with void_invoice, and a bank transfer records the
-- receiving account it went to.

-- An issued bill changes once more, to void, keeping every fact it was issued with. [app rule] A bill a payment settled
-- stays: a payment is undone only in its toast window (undo_payment), so the money never sits on a void bill.
create or replace function private.freeze_issued_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'issued' and new.status = 'void' then
    if (new.household_id, new.lease_id, new.period_start, new.period_end, new.due_date, new.issue_on, new.number, new.memo_code, new.issued_at)
      is distinct from (old.household_id, old.lease_id, old.period_start, old.period_end, old.due_date, old.issue_on, old.number, old.memo_code, old.issued_at) then
      raise exception 'ESTA_INVOICE_ISSUED' using errcode = '23514';
    end if;
    if exists (select 1 from public.payment_allocations a where a.invoice_id = old.id) then
      raise exception 'ESTA_INVOICE_HAS_PAYMENTS' using errcode = '23514';
    end if;
    return new;
  end if;
  if old.status <> 'draft' then
    raise exception 'ESTA_INVOICE_ISSUED' using errcode = '23514';
  end if;
  if (new.lease_id, new.period_start, new.number, new.memo_code) is distinct from (old.lease_id, old.period_start, old.number, old.memo_code) then
    raise exception 'ESTA_INVOICE_IDENTITY' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- The 20261007304000 guard, now holding the invoice's row in share mode: a void waits for an allocation in flight and
-- then sees it, and an allocation waits for a void in flight and then sees the bill is no longer issued.
create or replace function private.guard_payment_allocation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_amount bigint;
  v_allocated bigint;
begin
  if tg_op = 'UPDATE' and (new.payment_id, new.invoice_id) is distinct from (old.payment_id, old.invoice_id) then
    raise exception 'ESTA_ALLOCATION_IDENTITY' using errcode = '23514';
  end if;
  perform 1 from public.invoices i where i.id = new.invoice_id and i.household_id = new.household_id and i.status = 'issued' for share;
  if not found then
    raise exception 'ESTA_ALLOCATION_INVOICE_NOT_ISSUED' using errcode = '23514';
  end if;
  select p.amount_vnd into v_amount from public.payments p where p.id = new.payment_id and p.household_id = new.household_id for no key update;
  if not found then
    -- payment_allocations' foreign key refuses it.
    return new;
  end if;
  select coalesce(sum(a.amount_vnd), 0) into v_allocated
  from public.payment_allocations a
  where a.payment_id = new.payment_id and a.id <> new.id;
  if v_allocated + new.amount_vnd > v_amount then
    raise exception 'ESTA_ALLOCATION_EXCEEDS_PAYMENT' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- The 20261007401900 schedule, now naming a voided bill for its period when no live bill does, so the lease timeline
-- reads `Đã hủy` rather than "not billed". private.issue_invoices already skips a period any invoice overlaps, so a
-- voided period is never billed again.
create or replace function public.lease_schedule(p_lease_ids uuid[], p_until date)
returns table (
  lease_id uuid, period_start date, period_end date, due_date date, cycle_months integer, monthly_rent_vnd bigint,
  rent_vnd bigint, prorated boolean, covered_by_paid_through boolean, invoice_id uuid, invoice_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id, s.period_start, s.period_end, s.period_start + l.due_offset_days, s.cycle_months, s.monthly_rent_vnd, s.rent_vnd,
    s.prorated, coalesce(s.period_end <= l.paid_through_date, false), i.id, i.status
  from public.leases l
  cross join lateral private.lease_periods(l, p_until) s
  left join lateral (
    select i.id, i.status from public.invoices i
    where i.lease_id = l.id and i.period_start between s.period_start and s.period_end
    order by i.status = 'void', i.period_start
    limit 1
  ) i on true
  where l.id = any (p_lease_ids) and l.start_date is not null and l.rent_vnd is not null
    and private.is_member(l.household_id, 'viewer')
  order by l.id, s.period_start;
$$;

-- The bill a member acts on, with its lease locked: the lock record_payment and apply_deposit take, so a payment and a
-- void of one lease take turns.
create function private.member_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  perform 1 from public.leases l
  where l.id = (select i.lease_id from public.invoices i where i.id = p_invoice_id) and private.is_member(l.household_id, 'member')
  for no key update;
  if not found then
    raise exception 'ESTA_INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  return v_invoice;
end;
$$;
revoke all on function private.member_invoice(uuid) from public;

-- `Hủy hóa đơn`: an issued bill becomes void with the reason Mẹ gave. Its period stays billed by it, so nothing bills
-- that period again, and an end-lease date before it is no longer refused.
create function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices := private.member_invoice(p_invoice_id);
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'ESTA_VOID_REASON' using errcode = '22023';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'ESTA_INVOICE_NOT_ISSUED' using errcode = '55000';
  end if;
  update public.invoices i set status = 'void', voided_reason = btrim(p_reason) where i.id = p_invoice_id;
end;
$$;
revoke all on function public.void_invoice(uuid, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated;

-- `Phát hành`: a draft issues on the database clock's date, before the day the nightly job would issue it.
create function public.issue_invoice_now(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices := private.member_invoice(p_invoice_id);
  v_now timestamptz := private.audit_now();
begin
  perform private.issue_invoice(v_invoice.id, private.business_date(v_now), v_now);
end;
$$;
revoke all on function public.issue_invoice_now(uuid) from public, anon;
grant execute on function public.issue_invoice_now(uuid) to authenticated;

-- The household's account a transfer landed in. Only a transfer names one.
alter table public.payments add column bank_account_id uuid;
alter table public.payments
  add constraint payments_bank_account_fkey foreign key (household_id, bank_account_id)
    references public.bank_accounts (household_id, id) on delete set null (bank_account_id),
  add constraint payments_bank_account_transfer check (bank_account_id is null or method = 'bank_transfer');
create index payments_bank_account_idx on public.payments (bank_account_id) where bank_account_id is not null;

-- The 20261007305000 writer with p_bank_account_id, the account the sheet filled for `Chuyển khoản`.
drop function public.record_payment(uuid, bigint, bigint, text, date, uuid, uuid[]);

create function public.record_payment(
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
  v_left bigint := p_amount_vnd;
  v_open record;
  v_part bigint;
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

    for v_open in
      select b.id, b.outstanding_vnd from public.invoice_balances b
      where b.lease_id = v_lease.id and b.status = 'issued' and b.outstanding_vnd > 0
        and (p_invoice_ids is null or b.id = any (p_invoice_ids))
      order by b.due_date, b.period_start, b.id
    loop
      exit when v_left = 0;
      v_part := least(v_left, v_open.outstanding_vnd);
      insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
      values (v_lease.household_id, v_payment, v_open.id, v_part);
      v_left := v_left - v_part;
    end loop;
  end if;

  return query
    select p.id, p.amount_vnd, coalesce((select sum(a.amount_vnd) from public.payment_allocations a where a.payment_id = p.id), 0)::bigint
    from public.payments p
    where p.id = v_payment;
end;
$$;
revoke all on function public.record_payment(uuid, bigint, bigint, text, date, uuid, uuid[], uuid) from public, anon;
grant execute on function public.record_payment(uuid, bigint, bigint, text, date, uuid, uuid[], uuid) to authenticated;
