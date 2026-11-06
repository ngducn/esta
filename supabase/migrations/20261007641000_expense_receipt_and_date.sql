-- Two rules the expense sheet checks in TypeScript, held in the table so the connector and any other caller meet them
-- too (#211). A receipt belongs to the property of the expense it is filed under, and a paid date is never after
-- today in Asia/Ho_Chi_Minh, as `record_payment` already refuses for a payment. A trigger carries both, so a direct
-- write and `save_expense` are refused with the same sentinel. It acts only on a row whose date, property or receipt
-- differs from the stored row, and leaves a receipt of another household to the foreign key, so restoring an old
-- expense, a note edit, or a clock set back after the seed never trips it. `save_expense` writes with
-- `insert ... on conflict do update`, which fires BEFORE INSERT first, so on an insert the stored row of the same
-- household and id is loaded and the write is judged as the update it will become.
create function private.guard_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stored public.expenses;
begin
  if tg_op = 'INSERT' then
    select * into v_stored from public.expenses e where e.id = new.id and e.household_id = new.household_id;
  else
    v_stored := old;
  end if;
  if (v_stored.id is null or new.paid_on is distinct from v_stored.paid_on)
    and new.paid_on > private.business_date(private.audit_now()) then
    raise exception 'ESTA_EXPENSE_DATE_AFTER_TODAY' using errcode = '22023';
  end if;
  if new.document_id is not null
    and (v_stored.id is null or (new.document_id, new.property_id) is distinct from (v_stored.document_id, v_stored.property_id))
    and exists (
      select from public.documents d
      where d.id = new.document_id and d.household_id = new.household_id and d.property_id is distinct from new.property_id) then
    raise exception 'ESTA_EXPENSE_RECEIPT_PROPERTY' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_expense() from public;

create trigger guard_expense
  before insert or update on public.expenses
  for each row execute function private.guard_expense();
