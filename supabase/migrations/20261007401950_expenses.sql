-- Expenses per property (SPEC §5.4, FIN-1). Soft delete: deleting an expense sets deleted_at, so `Hoàn tác` brings it
-- back. A vendor or receipt of another household cannot be linked, because the keys carry the household.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid not null,
  category text not null check (category in (
    'repair', 'maintenance', 'land_tax', 'rental_tax', 'utility', 'management_fee', 'insurance', 'broker_fee', 'legal', 'other')),
  -- [app rule] The ceiling of payments and rents.
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  paid_on date not null,
  vendor_party_id uuid,
  document_id uuid,
  note text check (char_length(note) <= 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  foreign key (household_id, vendor_party_id) references public.parties (household_id, id) on delete set null (vendor_party_id),
  foreign key (household_id, document_id) references public.documents (household_id, id) on delete set null (document_id)
);
create index expenses_household_property_paid_idx on public.expenses (household_id, property_id, paid_on desc) where deleted_at is null;

select private.enable_household_rls('public.expenses', 'member');
select private.enable_audit('public.expenses');
select private.enable_soft_delete('public.expenses');

-- `Lưu` on the expense sheet (FIN-1): the expense, a vendor added in the sheet and the receipt photo in one transaction,
-- so a refused expense leaves no vendor or document behind and a photo reaches Tài liệu only with its expense. The
-- server builds the party and document rows (apps/web/src/server/expenses/actions.ts); this writes them under the
-- sheet's ids in the property's household, so a retry writes nothing new and a save converges on what the sheet sent
-- last. An expense of another household, or one deleted since the sheet opened, is refused.
create function public.save_expense(
  p_id uuid,
  p_property_id uuid,
  p_category text,
  p_amount_vnd bigint,
  p_paid_on date,
  p_note text default null,
  p_vendor_id uuid default null,
  p_document_id uuid default null,
  p_new_vendor jsonb default null,
  p_new_document jsonb default null
)
returns table (id uuid, amount_vnd bigint, property_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select p.household_id into v_household from public.properties p
  where p.id = p_property_id and p.deleted_at is null and private.is_member(p.household_id, 'member');
  if not found then
    raise exception 'ESTA_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_new_vendor is not null then
    insert into public.parties (id, household_id, kind, full_name, tags)
    select p_vendor_id, v_household, r.kind, r.full_name, r.tags
    from jsonb_populate_record(null::public.parties, p_new_vendor) r
    on conflict on constraint parties_pkey do nothing;
  end if;

  if p_new_document is not null then
    insert into public.documents (
      id, household_id, property_id, category, title, storage_path, mime, size_bytes, page_count, sha256, sensitivity, expires_on, lease_id)
    select p_document_id, v_household, r.property_id, r.category, r.title, r.storage_path, r.mime, r.size_bytes, r.page_count, r.sha256,
      r.sensitivity, r.expires_on, r.lease_id
    from jsonb_populate_record(null::public.documents, p_new_document) r
    on conflict on constraint documents_pkey do nothing;
  end if;

  return query
    insert into public.expenses as e (id, household_id, property_id, category, amount_vnd, paid_on, vendor_party_id, document_id, note)
    values (p_id, v_household, p_property_id, p_category, p_amount_vnd, p_paid_on, p_vendor_id, p_document_id, p_note)
    on conflict on constraint expenses_pkey do update set
      property_id = excluded.property_id,
      category = excluded.category,
      amount_vnd = excluded.amount_vnd,
      paid_on = excluded.paid_on,
      vendor_party_id = excluded.vendor_party_id,
      document_id = excluded.document_id,
      note = excluded.note
    where e.household_id = excluded.household_id and e.deleted_at is null
    returning e.id, e.amount_vnd, e.property_id;
  if not found then
    raise exception 'ESTA_EXPENSE_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.save_expense(uuid, uuid, text, bigint, date, text, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_expense(uuid, uuid, text, bigint, date, text, uuid, uuid, jsonb, jsonb) to authenticated;
