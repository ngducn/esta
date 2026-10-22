create view public.allocation_facts with (security_invoker = true) as
select
  a.household_id,
  l.property_id,
  l.unit_id,
  i.lease_id,
  a.invoice_id,
  a.payment_id,
  p.received_on,
  p.method,
  a.amount_vnd
from public.payment_allocations a
join public.payments p on p.id = a.payment_id
join public.invoices i on i.id = a.invoice_id
join public.leases l on l.id = i.lease_id
where i.status <> 'void';
revoke all on public.allocation_facts from anon, authenticated;
grant select on public.allocation_facts to authenticated;
