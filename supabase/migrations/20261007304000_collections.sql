-- Payments, their allocations, invoice balances and the collections board (SPEC §5.4, LSE-7 and LSE-10). Members read
-- payments here and write none: P3-10 records them through a security definer function that allocates in SQL, as
-- activate_lease issues invoices, so no caller chooses which invoice a payment settles.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  payer_party_id uuid,
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  received_on date not null,
  method text not null check (method in ('cash', 'bank_transfer', 'deposit', 'other')),
  bank_ref text check (btrim(bank_ref) <> '' and char_length(bank_ref) <= 200),
  memo text check (btrim(memo) <> '' and char_length(memo) <= 500),
  source text not null default 'manual' check (source in ('manual', 'statement_import', 'webhook', 'deposit_application')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, payer_party_id) references public.parties (household_id, id)
);
create index payments_household_received_idx on public.payments (household_id, received_on);
create index payments_payer_idx on public.payments (household_id, payer_party_id);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  payment_id uuid not null,
  invoice_id uuid not null,
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (payment_id, invoice_id),
  foreign key (household_id, payment_id) references public.payments (household_id, id) on delete cascade,
  foreign key (household_id, invoice_id) references public.invoices (household_id, id) on delete cascade
);
create index payment_allocations_invoice_idx on public.payment_allocations (invoice_id);

-- SPEC §5.4: a payment settles only issued invoices and never allocates more than it brought. The payment lock makes
-- two allocations of one payment take turns, so neither misses the other's amount.
create function private.guard_payment_allocation()
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
  if not exists (select 1 from public.invoices i where i.id = new.invoice_id and i.status = 'issued') then
    raise exception 'ESTA_ALLOCATION_INVOICE_NOT_ISSUED' using errcode = '23514';
  end if;
  select p.amount_vnd into v_amount from public.payments p where p.id = new.payment_id for no key update;
  select coalesce(sum(a.amount_vnd), 0) into v_allocated
  from public.payment_allocations a
  where a.payment_id = new.payment_id and a.id <> new.id;
  if v_allocated + new.amount_vnd > v_amount then
    raise exception 'ESTA_ALLOCATION_EXCEEDS_PAYMENT' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_payment_allocation() from public;

create trigger guard_payment_allocation
  before insert or update on public.payment_allocations
  for each row execute function private.guard_payment_allocation();

create function private.guard_payment_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.amount_vnd < (select coalesce(sum(a.amount_vnd), 0) from public.payment_allocations a where a.payment_id = new.id) then
    raise exception 'ESTA_ALLOCATION_EXCEEDS_PAYMENT' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_payment_amount() from public;

create trigger guard_payment_amount
  before update of amount_vnd on public.payments
  for each row execute function private.guard_payment_amount();

select private.enable_household_rls('public.payments', 'member');
select private.enable_audit('public.payments');
select private.enable_household_rls('public.payment_allocations', 'member');
select private.enable_audit('public.payment_allocations');

revoke insert, update, delete on table public.payments, public.payment_allocations from authenticated;
drop policy payments_insert on public.payments;
drop policy payments_update on public.payments;
drop policy payments_delete on public.payments;
drop policy payment_allocations_insert on public.payment_allocations;
drop policy payment_allocations_update on public.payment_allocations;
drop policy payment_allocations_delete on public.payment_allocations;

-- packages/core/src/allocation/status.ts derivePaymentStatus. A zero-total invoice owes nothing, so it reads paid.
-- invoice_balances_parity.test.sql holds it to supabase/tests/fixtures/payment_status.csv.
create function private.payment_status(p_total_vnd bigint, p_allocated_vnd bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_allocated_vnd > p_total_vnd then 'overpaid'
    when p_allocated_vnd = p_total_vnd then 'paid'
    when p_allocated_vnd = 0 then 'unpaid'
    else 'partial'
  end;
$$;
revoke all on function private.payment_status(bigint, bigint) from public;
grant execute on function private.payment_status(bigint, bigint) to authenticated;

-- Each invoice with what it bills, what payments settled and what is still owed. Callers filter on status: only an
-- issued invoice counts as due (SPEC §5.4).
create view public.invoice_balances with (security_invoker = true) as
select
  i.id,
  i.household_id,
  i.lease_id,
  i.number,
  i.period_start,
  i.period_end,
  i.due_date,
  i.issue_on,
  i.status,
  totals.total_vnd,
  totals.allocated_vnd,
  greatest(totals.total_vnd - totals.allocated_vnd, 0) as outstanding_vnd,
  private.payment_status(totals.total_vnd, totals.allocated_vnd) as payment_status
from public.invoices i
cross join lateral (
  select
    coalesce((select sum(l.amount_vnd) from public.invoice_lines l where l.invoice_id = i.id), 0)::bigint as total_vnd,
    coalesce((select sum(a.amount_vnd) from public.payment_allocations a where a.invoice_id = i.id), 0)::bigint as allocated_vnd
) totals;
grant select on public.invoice_balances to authenticated;

-- LSE-10: the issued invoices due in p_month, and every earlier issued invoice still owed, with the unit, the tenant
-- and the balance. Grouping by the Clock's date is packages/core groupCollections, so no as-of date is taken here.
create function public.collection_candidates(p_month date)
returns table (
  invoice_id uuid,
  household_id uuid,
  property_id uuid,
  property_nickname text,
  unit_id uuid,
  unit_label text,
  lease_id uuid,
  tenant_party_id uuid,
  tenant_name text,
  number text,
  period_start date,
  period_end date,
  due_date date,
  total_vnd bigint,
  allocated_vnd bigint,
  outstanding_vnd bigint,
  payment_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    b.id, b.household_id, l.property_id, p.nickname, l.unit_id, u.label, b.lease_id, l.tenant_party_id, t.full_name,
    b.number, b.period_start, b.period_end, b.due_date, b.total_vnd, b.allocated_vnd, b.outstanding_vnd, b.payment_status
  from public.invoice_balances b
  join public.leases l on l.id = b.lease_id
  join public.units u on u.id = l.unit_id
  join public.properties p on p.id = l.property_id
  left join public.parties t on t.id = l.tenant_party_id
  where b.status = 'issued'
    and p.deleted_at is null
    and b.due_date < (date_trunc('month', p_month) + interval '1 month')::date
    and (b.due_date >= date_trunc('month', p_month)::date or b.outstanding_vnd > 0);
$$;
revoke all on function public.collection_candidates(date) from public, anon;
grant execute on function public.collection_candidates(date) to authenticated;
