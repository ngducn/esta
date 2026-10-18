-- Recording a payment from the collections board (LSE-7, SPEC §7.4). As activate_lease issues invoices, record_payment
-- is the only way a member writes a payment: the lease, the payer and the household come from the invoice, the
-- allocation is computed here, and the date is checked against the database clock.

alter table public.payments add column idempotency_key uuid;
alter table public.payments add constraint payments_household_id_idempotency_key_key unique (household_id, idempotency_key);

-- p_invoice_id is the board row's invoice. With p_invoice_ids null the payment settles the lease's open issued invoices
-- oldest due first; with a choice it settles only those, still oldest first, and each must be an issued invoice of the
-- same lease. packages/core allocatePayment does the same over the same rows, and payments.integration.test.ts holds the
-- two equal. What is left is the tenant's credit. A key seen before returns that payment and writes nothing.
-- p_owed_vnd is what the sheet saw owed when it opened (packages/core owedFor): through the row's invoice, or over the
-- chosen ones. When the database disagrees, or the row or a chosen invoice is paid, someone recorded or undid a payment
-- on this lease since then, and the sheet's amount would be sent on to a later invoice, so nothing is written.
create function public.record_payment(
  p_invoice_id uuid,
  p_owed_vnd bigint,
  p_amount_vnd bigint,
  p_method text,
  p_received_on date,
  p_idempotency_key uuid,
  p_invoice_ids uuid[] default null
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

    insert into public.payments (household_id, payer_party_id, amount_vnd, received_on, method, source, idempotency_key)
    values (v_lease.household_id, v_lease.tenant_party_id, p_amount_vnd, p_received_on, p_method, 'manual', p_idempotency_key)
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
revoke all on function public.record_payment(uuid, bigint, bigint, text, date, uuid, uuid[]) from public, anon;
grant execute on function public.record_payment(uuid, bigint, bigint, text, date, uuid, uuid[]) to authenticated;

-- `Hoàn tác` on the saved toast. Only the member who recorded a manual payment removes it, and only shortly after: the
-- toast shows for 6 s, and the window allows for a slow network. It compares wall-clock moments on both sides, because
-- the test clock freezes the business clock but not created_at. A payment already gone returns quietly, so a repeated
-- tap is harmless. Its allocations go with it, and the audit log keeps the insert and the delete of both.
create function public.undo_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select p.* into v_payment from public.payments p
  where p.id = p_payment_id and private.is_member(p.household_id, 'member')
  for update;
  if not found then
    return;
  end if;
  if v_payment.created_by is distinct from auth.uid()
    or v_payment.source <> 'manual'
    or v_payment.method not in ('cash', 'bank_transfer')
    or now() - v_payment.created_at > interval '2 minutes' then
    raise exception 'ESTA_PAYMENT_NOT_UNDOABLE' using errcode = '42501';
  end if;
  delete from public.payments p where p.id = p_payment_id;
end;
$$;
revoke all on function public.undo_payment(uuid) from public, anon;
grant execute on function public.undo_payment(uuid) to authenticated;
