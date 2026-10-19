-- Deposits on a lease (SPEC §5.4, LSE-7, LSE-9). A member writes the ledger only through record_deposit_entry and
-- apply_deposit, which take the lease lock, check the database clock's date and keep the held balance at or above zero
-- at every point in date order, the rule packages/core deriveDepositLedger refuses by. Held deposit is derived, never
-- stored.

create table public.deposit_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  lease_id uuid not null,
  kind text not null check (kind in ('received', 'applied', 'deduction', 'refunded')),
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  on_date date not null,
  note text check (btrim(note) <> '' and char_length(note) <= 1000),
  payment_id uuid unique,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, idempotency_key),
  -- An applied entry is the deposit side of exactly one payment; no other kind moves money through payments.
  constraint deposit_entries_applied_payment check ((kind = 'applied') = (payment_id is not null)),
  -- [app rule] A deduction says what it paid for, so the tenant can be told.
  constraint deposit_entries_deduction_note check (kind <> 'deduction' or note is not null),
  foreign key (household_id, lease_id) references public.leases (household_id, id) on delete cascade,
  foreign key (household_id, payment_id) references public.payments (household_id, id)
);
create index deposit_entries_lease_idx on public.deposit_entries (lease_id, on_date);

select private.enable_household_rls('public.deposit_entries', 'member');
select private.enable_audit('public.deposit_entries');
revoke insert, update, delete on table public.deposit_entries from authenticated;
drop policy deposit_entries_insert on public.deposit_entries;
drop policy deposit_entries_update on public.deposit_entries;
drop policy deposit_entries_delete on public.deposit_entries;

-- What each lease holds, for lease detail and the household's liability total on Tài sản (LSE-9). A lease with no
-- entries holds nothing.
create view public.lease_deposits with (security_invoker = true) as
select
  l.id as lease_id,
  l.household_id,
  coalesce(sum(case when e.kind = 'received' then e.amount_vnd else -e.amount_vnd end), 0)::bigint as held_vnd
from public.leases l
left join public.deposit_entries e on e.lease_id = l.id
group by l.id, l.household_id;
revoke all on public.lease_deposits from anon, authenticated;
grant select on public.lease_deposits to authenticated;

-- The ledger's lowest running balance in the order deriveDepositLedger reads it. Below zero means an entry took out
-- more than was held at its date, even when a later receipt brings the total back.
create function private.deposit_low_point(p_lease_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(min(running), 0)::bigint from (
    select sum(case when e.kind = 'received' then e.amount_vnd else -e.amount_vnd end)
      over (order by e.on_date, e.created_at, e.id rows unbounded preceding) as running
    from public.deposit_entries e
    where e.lease_id = p_lease_id
  ) ledger;
$$;
revoke all on function private.deposit_low_point(uuid) from public;

-- The checks every deposit write shares, after the lease lock: the key, a positive amount and a date no later than the
-- database clock's day. Returns the entry already written with this key, or null.
create function private.deposit_entry_seen(p_lease public.leases, p_amount_vnd bigint, p_on_date date, p_idempotency_key uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_seen uuid;
begin
  if p_idempotency_key is null then
    raise exception 'ESTA_DEPOSIT_KEY_MISSING' using errcode = '22023';
  end if;
  select e.id into v_seen from public.deposit_entries e
  where e.household_id = p_lease.household_id and e.idempotency_key = p_idempotency_key;
  if found then
    return v_seen;
  end if;
  if p_lease.status not in ('active', 'ended', 'terminated') then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  if p_amount_vnd is null or p_amount_vnd < 1 then
    raise exception 'ESTA_DEPOSIT_AMOUNT' using errcode = '22023';
  end if;
  if p_on_date is null or p_on_date > private.business_date(private.audit_now()) then
    raise exception 'ESTA_DEPOSIT_DATE_AFTER_TODAY' using errcode = '22023';
  end if;
  return null;
end;
$$;
revoke all on function private.deposit_entry_seen(public.leases, bigint, date, uuid) from public;

create function private.refuse_deposit_overdraw(p_lease_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if private.deposit_low_point(p_lease_id) < 0 then
    raise exception 'ESTA_DEPOSIT_EXCEEDS_HELD' using errcode = '23514';
  end if;
end;
$$;
revoke all on function private.refuse_deposit_overdraw(uuid) from public;

-- LSE-9: a deposit received, deducted for a stated reason, or refunded to the tenant. A key seen before returns that
-- entry and writes nothing (SPEC §7.4).
create function public.record_deposit_entry(
  p_lease_id uuid,
  p_kind text,
  p_amount_vnd bigint,
  p_on_date date,
  p_idempotency_key uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases := private.member_lease(p_lease_id);
  v_id uuid := private.deposit_entry_seen(v_lease, p_amount_vnd, p_on_date, p_idempotency_key);
  v_note text := nullif(btrim(p_note), '');
begin
  if v_id is not null then
    return v_id;
  end if;
  if p_kind is null or p_kind not in ('received', 'deduction', 'refunded') then
    raise exception 'ESTA_DEPOSIT_KIND' using errcode = '22023';
  end if;
  if p_kind = 'deduction' and v_note is null then
    raise exception 'ESTA_DEPOSIT_NOTE_REQUIRED' using errcode = '22023';
  end if;
  insert into public.deposit_entries (household_id, lease_id, kind, amount_vnd, on_date, note, idempotency_key)
  values (v_lease.household_id, v_lease.id, p_kind, p_amount_vnd, p_on_date, v_note, p_idempotency_key)
  returning id into v_id;
  perform private.refuse_deposit_overdraw(v_lease.id);
  return v_id;
end;
$$;
revoke all on function public.record_deposit_entry(uuid, text, bigint, date, uuid, text) from public, anon;
grant execute on function public.record_deposit_entry(uuid, text, bigint, date, uuid, text) to authenticated;

-- LSE-7 deposit application: part of the held deposit pays one issued invoice of the same lease. The payment (method
-- `deposit`, source `deposit_application`), its allocation and the `applied` entry are written together or not at all.
-- The lease lock is the one record_payment takes, so a payment and an application of one lease take turns and neither
-- settles what the other already did.
create function public.apply_deposit(
  p_lease_id uuid,
  p_invoice_id uuid,
  p_amount_vnd bigint,
  p_on_date date,
  p_idempotency_key uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases := private.member_lease(p_lease_id);
  v_id uuid := private.deposit_entry_seen(v_lease, p_amount_vnd, p_on_date, p_idempotency_key);
  v_outstanding bigint;
  v_payment uuid;
begin
  if v_id is not null then
    return v_id;
  end if;
  select b.outstanding_vnd into v_outstanding from public.invoice_balances b
  where b.id = p_invoice_id and b.lease_id = v_lease.id and b.status = 'issued';
  if not found then
    raise exception 'ESTA_INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_amount_vnd > v_outstanding then
    raise exception 'ESTA_DEPOSIT_EXCEEDS_OUTSTANDING' using errcode = '23514';
  end if;
  insert into public.payments (household_id, payer_party_id, amount_vnd, received_on, method, source)
  values (v_lease.household_id, v_lease.tenant_party_id, p_amount_vnd, p_on_date, 'deposit', 'deposit_application')
  returning id into v_payment;
  insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
  values (v_lease.household_id, v_payment, p_invoice_id, p_amount_vnd);
  insert into public.deposit_entries (household_id, lease_id, kind, amount_vnd, on_date, note, payment_id, idempotency_key)
  values (v_lease.household_id, v_lease.id, 'applied', p_amount_vnd, p_on_date, nullif(btrim(p_note), ''), v_payment, p_idempotency_key)
  returning id into v_id;
  perform private.refuse_deposit_overdraw(v_lease.id);
  return v_id;
end;
$$;
revoke all on function public.apply_deposit(uuid, uuid, bigint, date, uuid, text) from public, anon;
grant execute on function public.apply_deposit(uuid, uuid, bigint, date, uuid, text) to authenticated;
