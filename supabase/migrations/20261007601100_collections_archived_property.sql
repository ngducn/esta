-- Archiving a property must not hide what its tenants still owe (#134). The board keeps an archived property's issued
-- invoices that are still owed, and says so with property_archived; an archived property's paid invoices leave the
-- board, as the rest of the property does. The result gains a column, so the function is replaced, not altered.

drop function public.collection_candidates(date);

create function public.collection_candidates(p_month date)
returns table (
  invoice_id uuid,
  household_id uuid,
  property_id uuid,
  property_nickname text,
  property_archived boolean,
  unit_id uuid,
  unit_label text,
  unit_kind text,
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
    b.id, b.household_id, l.property_id, p.nickname, p.deleted_at is not null, l.unit_id, u.label, u.kind, b.lease_id,
    l.tenant_party_id, t.full_name, b.number, b.period_start, b.period_end, b.due_date, b.total_vnd, b.allocated_vnd,
    b.outstanding_vnd, b.payment_status
  from public.invoice_balances b
  join public.leases l on l.id = b.lease_id
  join public.units u on u.id = l.unit_id
  join public.properties p on p.id = l.property_id
  left join public.parties t on t.id = l.tenant_party_id
  where b.status = 'issued'
    and (p.deleted_at is null or b.outstanding_vnd > 0)
    and b.due_date < (date_trunc('month', p_month) + interval '1 month')::date
    and (b.due_date >= date_trunc('month', p_month)::date or b.outstanding_vnd > 0);
$$;
revoke all on function public.collection_candidates(date) from public, anon;
grant execute on function public.collection_candidates(date) to authenticated;
