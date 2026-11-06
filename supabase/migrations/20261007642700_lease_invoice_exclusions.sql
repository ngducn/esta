-- Two promises the billing tables made through hand-written checks are now kept by the database itself (#198): a room
-- is held by one lease that has started (active, terminated or ended) on any day, and a lease has one bill on any day. The service role, the seed and
-- any later write path meet the same refusal as a member does.
-- A void bill keeps its stretch: if it did not, the nightly job would draft the voided stretch again.
create extension if not exists btree_gist with schema extensions;

alter table public.leases
  add constraint leases_room_one_holder
  exclude using gist (unit_id with =, daterange(start_date, end_date, '[]') with &&)
  where (status <> 'draft');

alter table public.invoices
  add constraint invoices_lease_one_bill_per_day
  exclude using gist (lease_id with =, daterange(period_start, period_end, '[]') with &&);

-- The 20261007306700 guard with the unit lock and the overlap query kept: an exclusion constraint does not serialize two
-- writers (each waits for the other's index entry and Postgres kills one with 40P01), so the lock makes two activations of
-- one room take turns and the second answers ESTA_LEASE_OVERLAP. The constraint stays as the backstop for every other write.
create or replace function private.guard_lease()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and current_user = 'authenticated' then
      raise exception 'ESTA_LEASE_NOT_DRAFT' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.status <> old.status and current_user = 'authenticated' then
    raise exception '%', case when old.status = 'draft' and new.status = 'active' then 'ESTA_LEASE_ACTIVATE_THROUGH_FUNCTION'
      else 'ESTA_LEASE_STATUS_THROUGH_FUNCTION' end using errcode = '42501';
  end if;
  if new.status <> old.status and not (old.status, new.status) in (('draft', 'active'), ('active', 'ended'), ('active', 'terminated')) then
    raise exception 'ESTA_LEASE_TRANSITION' using errcode = '23514', detail = format('%s to %s', old.status, new.status);
  end if;
  if old.status <> 'draft' and (
    (
      new.property_id, new.unit_id, new.tenant_party_id, new.start_date, new.rent_vnd, new.billing_cycle_months,
      new.period_anchor, new.first_period_proration, new.due_offset_days, new.deposit_vnd, new.escalation,
      new.utilities_mode, new.paid_through_date
    ) is distinct from (
      old.property_id, old.unit_id, old.tenant_party_id, old.start_date, old.rent_vnd, old.billing_cycle_months,
      old.period_anchor, old.first_period_proration, old.due_offset_days, old.deposit_vnd, old.escalation,
      old.utilities_mode, old.paid_through_date
    )
    or (new.end_date is distinct from old.end_date and not (old.status = 'active' and new.status = 'terminated'))
  ) then
    raise exception 'ESTA_LEASE_TERMS_LOCKED' using errcode = '23514';
  end if;
  if old.status = 'draft' and new.status = 'active' then
    perform 1 from public.units u where u.id = new.unit_id for no key update;
    if exists (
      select 1 from public.leases l
      where l.unit_id = new.unit_id and l.id <> new.id and l.status <> 'draft'
        and daterange(l.start_date, l.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    ) then
      raise exception 'ESTA_LEASE_OVERLAP' using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

-- The 20261007402600 issuance with the exclusion constraint doing the overlap skip: a planned period that shares a day
-- with a bill the lease already holds is refused by the database with 23P01 (or 23505 when it starts the same day as one),
-- and the loop moves on to the next period.
create or replace function private.issue_invoices(p_lease_id uuid, p_as_of date, p_issued_at timestamptz, out drafted integer, out issued integer)
language plpgsql
set search_path = ''
as $$
declare
  v_lease public.leases;
  v_plan record;
  v_id uuid;
  v_constraint text;
  v_metered boolean;
begin
  drafted := 0;
  select * into v_lease from public.leases l where l.id = p_lease_id for no key update;
  if v_lease.status is null or v_lease.status not in ('active', 'ended', 'terminated') then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  v_metered := v_lease.utilities_mode = 'metered_by_owner'
    and exists (select 1 from public.meters m join public.meter_readings r on r.meter_id = m.id where m.unit_id = v_lease.unit_id);
  if v_lease.status in ('active', 'terminated') then
    for v_plan in select * from private.plan_invoices(v_lease, p_as_of) loop
      v_id := null;
      for attempt in 1 .. 5 loop
        begin
          insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
          values (v_lease.household_id, v_lease.id, v_plan.period_start, v_plan.period_end, v_plan.due_date, v_plan.issue_on)
          returning id into v_id;
          exit;
        exception
          when exclusion_violation then
            exit;
          when unique_violation then
            get stacked diagnostics v_constraint = constraint_name;
            if v_constraint = 'invoices_lease_id_period_start_key' then
              exit;
            end if;
            if v_constraint <> 'invoices_household_id_memo_code_key' or attempt = 5 then
              raise;
            end if;
        end;
      end loop;
      continue when v_id is null;
      insert into public.invoice_lines (household_id, invoice_id, kind, quantity, unit_price_vnd, amount_vnd)
      values (v_lease.household_id, v_id, 'rent', 1, v_plan.rent_vnd, v_plan.rent_vnd);
      drafted := drafted + 1;
    end loop;
  end if;
  if v_metered then
    perform private.refresh_meter_lines(v_lease);
  end if;
  update public.invoices i set status = 'issued', issued_at = p_issued_at, issue_on = least(i.issue_on, p_as_of)
  where i.lease_id = p_lease_id and i.status = 'draft'
    and (i.issue_on <= p_as_of or (v_metered and private.readings_complete(v_lease, i.period_start)))
    and (v_lease.status = 'active'
      or (i.period_start <= v_lease.end_date and (v_lease.status = 'terminated' or v_lease.end_date < p_as_of)));
  get diagnostics issued = row_count;
end;
$$;

-- Activation under the lease's own lock: the bills Ryan was shown (p_expected_bills, as preview_activation returns them)
-- are planned again here and must be the same, so a draft edited or a midnight crossed since the plan stops the start
-- instead of writing other bills. A lease whose property is in the trash does not start, and a room another lease holds
-- answers ESTA_LEASE_OVERLAP.
drop function public.activate_lease(uuid, date);
create function public.activate_lease(p_lease_id uuid, p_paid_through date default null, p_expected_bills jsonb default null)
returns table (id uuid, period_start date, period_end date, due_date date, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_lease public.leases;
  v_now timestamptz := private.audit_now();
  v_today date := private.business_date(v_now);
  v_bills jsonb;
begin
  select * into v_lease from public.leases l
  where l.id = p_lease_id and private.is_member(l.household_id, 'member')
  for no key update;
  if not found then
    raise exception 'ESTA_LEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_lease.status = 'active' then
    raise exception 'ESTA_LEASE_ALREADY_ACTIVE' using errcode = '55000';
  end if;
  if not exists (select 1 from public.properties p where p.id = v_lease.property_id and p.deleted_at is null) then
    raise exception 'ESTA_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_bills is not null and v_lease.start_date is not null and v_lease.rent_vnd is not null then
    v_lease.paid_through_date := p_paid_through;
    select coalesce(jsonb_agg(jsonb_build_object(
      'period_start', p.period_start, 'period_end', p.period_end, 'due_date', p.due_date, 'rent_vnd', p.rent_vnd, 'issues_now', p.issue_on <= v_today
    ) order by p.period_start), '[]'::jsonb) into v_bills
    from private.plan_invoices(v_lease, v_today) p;
    if v_bills is distinct from p_expected_bills then
      raise exception 'ESTA_ACTIVATION_BILLS_CHANGED' using errcode = '40001';
    end if;
  end if;
  update public.leases l set status = 'active', paid_through_date = p_paid_through where l.id = p_lease_id;
  perform private.issue_invoices(p_lease_id, v_today, v_now);
  return query
    select i.id, i.period_start, i.period_end, i.due_date, i.status from public.invoices i
    where i.lease_id = p_lease_id
    order by i.period_start;
end;
$$;
revoke all on function public.activate_lease(uuid, date, jsonb) from public, anon;
grant execute on function public.activate_lease(uuid, date, jsonb) to authenticated;
