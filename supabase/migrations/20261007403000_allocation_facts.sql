-- Income as the ledger counts it (FIN-2): each allocation of a payment to a bill, on the day the payment was received,
-- with the property and unit of the bill's lease. The ledger, the reports and the assistant's ledger tool read income
-- only here. A deposit counts when it is applied, as a `deposit` payment; a deposit received is a deposit_entries row
-- and never appears. Money kept as credit counts once it is allocated. An undone payment is deleted with its
-- allocations, and a bill with payments cannot be voided; a void bill is still left out, so income never sits on one.
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
