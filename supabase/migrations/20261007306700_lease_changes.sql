-- Amend, terminate and renew (SPEC §5.4, LSE-2, LSE-3). Like activation, each is one function a member calls with the
-- session client: it changes the lease and re-plans its drafts on the database clock's date in one transaction, so no
-- caller writes status, end dates, amendments or invoices directly. Issued invoices never change.

create table public.lease_amendments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  lease_id uuid not null,
  effective_period_start date not null,
  -- packages/core/src/schedule AmendmentChanges: a monthly rent, a billing cycle, or both.
  changes jsonb not null check (
    jsonb_typeof(changes) = 'object'
    and changes <> '{}'
    and changes - array['rent_vnd', 'billing_cycle_months'] = '{}'
    and (not changes ? 'rent_vnd' or (
      jsonb_typeof(changes -> 'rent_vnd') = 'number'
      and changes ->> 'rent_vnd' ~ '^[1-9][0-9]{0,12}$'
      and (changes ->> 'rent_vnd')::bigint <= 1000000000000))
    and (not changes ? 'billing_cycle_months' or (
      jsonb_typeof(changes -> 'billing_cycle_months') = 'number' and changes ->> 'billing_cycle_months' in ('1', '3', '6', '12')))
  ),
  reason text check (btrim(reason) <> '' and char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  -- validateAmendment's duplicate_effective_start.
  constraint lease_amendments_duplicate_effective_start unique (lease_id, effective_period_start),
  foreign key (household_id, lease_id) references public.leases (household_id, id) on delete cascade
);

select private.enable_household_rls('public.lease_amendments', 'member');
select private.enable_audit('public.lease_amendments');
revoke insert, update, delete on table public.lease_amendments from authenticated;
drop policy lease_amendments_insert on public.lease_amendments;
drop policy lease_amendments_update on public.lease_amendments;
drop policy lease_amendments_delete on public.lease_amendments;

-- A terminated lease ends on its termination date, so every rule that reads end_date stops billing there (#144).
alter table public.leases
  add constraint leases_terminated_end check (status <> 'terminated' or end_date = terminated_on),
  add constraint leases_renewal_other check (renewal_of_lease_id <> id);
create index leases_renewal_idx on public.leases (renewal_of_lease_id) where renewal_of_lease_id is not null;

-- A member edits a draft's terms and any lease's notes; status, the paid-through date, termination and the renewal link
-- move only through activate_lease, terminate_lease and renew_lease (#144). guard_lease freezes the rest once active.
revoke update on table public.leases from authenticated;
grant update (
  unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor, first_period_proration,
  due_offset_days, deposit_vnd, escalation, utilities_mode, tax_payer, declaring_party_id, notice_days, notes
) on table public.leases to authenticated;

-- The 20261007302000 guard, with end_date free to move only as termination moves it, and no status change by a member.
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
    -- The unit lock makes two activations on one unit take turns, so neither misses the other's lease.
    perform 1 from public.units u where u.id = new.unit_id for no key update;
    if exists (
      select 1 from public.leases l
      where l.unit_id = new.unit_id and l.id <> new.id and l.status in ('active', 'terminated')
        and daterange(l.start_date, l.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    ) then
      raise exception 'ESTA_LEASE_OVERLAP' using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

-- The SQL twin of packages/core/src/schedule generateSchedule: every period starting on or before p_until (and the end
-- date), with the lease's amendments. An amendment applies from the period that starts on its effective date; one that
-- matches no period start stops every later one from applying, which amend_lease refuses.
create function private.lease_periods(p_lease public.leases, p_until date)
returns table (
  period_start date, period_end date, cycle_months integer, monthly_rent_vnd bigint, rent_vnd bigint,
  full_period_vnd bigint, full_days integer, prorated boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_last_start date := least(coalesce(p_lease.end_date, p_until), p_until);
  v_origin date := case when p_lease.period_anchor = 'lease_start' then p_lease.start_date else date_trunc('month', p_lease.start_date)::date end;
  v_cycle integer := p_lease.billing_cycle_months;
  v_kind text := p_lease.escalation ->> 'kind';
  v_every integer := (p_lease.escalation ->> 'every_months')::integer;
  v_step_value numeric := (p_lease.escalation ->> 'value')::numeric;
  v_rounding numeric := coalesce((p_lease.escalation ->> 'rounding_vnd')::numeric, 100000);
  v_base numeric := p_lease.rent_vnd;
  v_base_from date := p_lease.start_date;
  v_starts date[];
  v_changes jsonb[];
  v_next integer := 1;
  v_offset integer := 0;
  v_full_start date := v_origin;
  v_start date := p_lease.start_date;
  v_natural_end date;
  v_end date;
  v_charge_start date;
  v_days integer;
  v_monthly numeric;
begin
  select coalesce(array_agg(a.effective_period_start order by a.effective_period_start), '{}'),
         coalesce(array_agg(a.changes order by a.effective_period_start), '{}')
  into v_starts, v_changes
  from public.lease_amendments a
  where a.lease_id = p_lease.id;
  while v_start <= v_last_start loop
    while v_next <= cardinality(v_starts) and v_starts[v_next] = v_start loop
      v_cycle := coalesce((v_changes[v_next] ->> 'billing_cycle_months')::integer, v_cycle);
      if v_changes[v_next] ? 'rent_vnd' then
        v_base := (v_changes[v_next] ->> 'rent_vnd')::numeric;
        v_base_from := v_start;
      end if;
      v_next := v_next + 1;
    end loop;
    v_natural_end := (v_origin + make_interval(months => v_offset + v_cycle))::date - 1;
    v_end := least(v_natural_end, coalesce(p_lease.end_date, v_natural_end));
    v_charge_start := case when p_lease.first_period_proration = 'none' and v_end = v_natural_end then v_full_start else v_start end;
    full_days := v_natural_end - v_full_start + 1;
    v_days := v_end - v_charge_start + 1;
    v_monthly := v_base;
    if v_kind <> 'none' then
      for i in 1 .. private.months_until(p_lease.start_date, v_start) / v_every - private.months_until(p_lease.start_date, v_base_from) / v_every loop
        v_monthly := case v_kind
          when 'percent' then private.scale_round_half_up(v_monthly, 10000 + v_step_value, 10000, v_rounding)
          else private.scale_round_half_up(v_monthly + v_step_value, 1, 1, v_rounding)
        end;
      end loop;
    end if;
    period_start := v_start;
    period_end := v_end;
    cycle_months := v_cycle;
    monthly_rent_vnd := v_monthly;
    full_period_vnd := v_monthly * v_cycle;
    prorated := v_days < full_days;
    rent_vnd := case when prorated then private.scale_round_half_up(v_monthly, v_cycle * v_days, full_days, 1) else v_monthly * v_cycle end;
    return next;
    v_offset := v_offset + v_cycle;
    v_full_start := (v_origin + make_interval(months => v_offset))::date;
    v_start := v_full_start;
  end loop;
end;
$$;
revoke all on function private.lease_periods(public.leases, date) from public;

-- The 20261007302000 plan over lease_periods, so amendments bill: every period ending on or after p_as_of and starting
-- within 35 days of it, less what paid_through_date covers. leases.integration.test.ts compares it with planInvoices.
create or replace function private.plan_invoices(p_lease public.leases, p_as_of date)
returns table (period_start date, period_end date, due_date date, issue_on date, rent_vnd bigint)
language sql
stable
set search_path = ''
as $$
  select
    billed.start,
    s.period_end,
    billed.start + p_lease.due_offset_days,
    case when p_lease.utilities_mode = 'metered_by_owner' then billed.start + p_lease.due_offset_days else billed.start end,
    case when billed.start = s.period_start then s.rent_vnd
      else private.scale_round_half_up(
        case when s.prorated then s.full_period_vnd else s.rent_vnd end,
        s.period_end - billed.start + 1,
        case when s.prorated then s.full_days else s.period_end - s.period_start + 1 end,
        1)::bigint
    end
  from private.lease_periods(p_lease, p_as_of + 35) s
  cross join lateral (
    select case when p_lease.paid_through_date is null or p_lease.paid_through_date < s.period_start then s.period_start
      else p_lease.paid_through_date + 1 end as start
  ) billed
  where s.period_end >= p_as_of and (p_lease.paid_through_date is null or p_lease.paid_through_date < s.period_end)
  order by s.period_start;
$$;

-- The 20261007306200 issuance, with a terminated lease billed like an active one up to its termination date: it keeps
-- drafting the periods it still owes, and never issues one that starts after that date.
create or replace function private.issue_invoices(p_lease_id uuid, p_as_of date, p_issued_at timestamptz, out drafted integer, out issued integer)
language plpgsql
set search_path = ''
as $$
declare
  v_lease public.leases;
  v_plan record;
  v_id uuid;
  v_constraint text;
begin
  drafted := 0;
  select * into v_lease from public.leases l where l.id = p_lease_id for no key update;
  if v_lease.status is null or v_lease.status not in ('active', 'ended', 'terminated') then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  if v_lease.status in ('active', 'terminated') then
    for v_plan in select * from private.plan_invoices(v_lease, p_as_of) loop
      continue when exists (
        select 1 from public.invoices i
        where i.lease_id = v_lease.id and daterange(i.period_start, i.period_end, '[]') && daterange(v_plan.period_start, v_plan.period_end, '[]')
      );
      for attempt in 1 .. 5 loop
        begin
          insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
          values (v_lease.household_id, v_lease.id, v_plan.period_start, v_plan.period_end, v_plan.due_date, v_plan.issue_on)
          returning id into v_id;
          exit;
        exception when unique_violation then
          get stacked diagnostics v_constraint = constraint_name;
          if v_constraint <> 'invoices_household_id_memo_code_key' or attempt = 5 then
            raise;
          end if;
        end;
      end loop;
      insert into public.invoice_lines (household_id, invoice_id, kind, quantity, unit_price_vnd, amount_vnd)
      values (v_lease.household_id, v_id, 'rent', 1, v_plan.rent_vnd, v_plan.rent_vnd);
      drafted := drafted + 1;
    end loop;
  end if;
  update public.invoices i set status = 'issued', issued_at = p_issued_at
  where i.lease_id = p_lease_id and i.status = 'draft' and i.issue_on <= p_as_of
    and (v_lease.status = 'active'
      or (i.period_start <= v_lease.end_date and (v_lease.status = 'terminated' or v_lease.end_date < p_as_of)));
  get diagnostics issued = row_count;
end;
$$;

create or replace function public.run_invoicing(p_household_id uuid, p_as_of date, p_issued_at timestamptz)
returns table (drafted integer, issued integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease uuid;
  v_done record;
begin
  if p_household_id is null or p_as_of is null or p_issued_at is null then
    raise exception 'ESTA_CRON_ARGUMENTS' using errcode = '22004';
  end if;
  drafted := 0;
  issued := 0;
  for v_lease in
    select l.id from public.leases l
    where l.household_id = p_household_id and (
      l.status = 'active'
      or (l.status = 'terminated' and l.end_date >= p_as_of)
      or (l.status in ('ended', 'terminated') and exists (
        select 1 from public.invoices i where i.lease_id = l.id and i.status = 'draft' and i.issue_on <= p_as_of
      ))
    )
    order by l.id
  loop
    select * into v_done from private.issue_invoices(v_lease, p_as_of, p_issued_at);
    drafted := drafted + v_done.drafted;
    issued := issued + v_done.issued;
  end loop;
  return next;
end;
$$;

-- The lease when the caller is a member of its household, locked for the rest of the transaction.
create function private.member_lease(p_lease_id uuid)
returns public.leases
language plpgsql
set search_path = ''
as $$
declare
  v_lease public.leases;
begin
  select * into v_lease from public.leases l
  where l.id = p_lease_id and private.is_member(l.household_id, 'member')
  for no key update;
  if not found then
    raise exception 'ESTA_LEASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_lease;
end;
$$;
revoke all on function private.member_lease(uuid) from public;

-- LSE-2 and LSE-3: new money terms from a later period start. The start must open a period after the database clock's
-- date that nothing has billed yet (no issued invoice reaches it and the paid-through date stops before it), so every
-- issued invoice stays as it is; then the drafts from that start are planned again on the new terms.
create function public.amend_lease(
  p_lease_id uuid,
  p_effective_period_start date,
  p_rent_vnd bigint default null,
  p_billing_cycle_months integer default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases := private.member_lease(p_lease_id);
  v_now timestamptz := private.audit_now();
  v_today date := private.business_date(v_now);
  v_id uuid;
  v_stranded date;
begin
  if v_lease.status <> 'active' then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  if p_effective_period_start is null or p_effective_period_start <= v_today then
    raise exception 'ESTA_AMENDMENT_NOT_AFTER_AS_OF' using errcode = '22023';
  end if;
  if p_effective_period_start <= v_lease.paid_through_date or exists (
    select 1 from public.invoices i where i.lease_id = v_lease.id and i.status = 'issued' and i.period_end >= p_effective_period_start
  ) then
    raise exception 'ESTA_AMENDMENT_ALREADY_BILLED' using errcode = '22023';
  end if;
  if p_rent_vnd is null and p_billing_cycle_months is null then
    raise exception 'ESTA_AMENDMENT_EMPTY' using errcode = '22023';
  end if;
  if exists (select 1 from public.lease_amendments a where a.lease_id = v_lease.id and a.effective_period_start = p_effective_period_start) then
    raise exception 'ESTA_AMENDMENT_DUPLICATE' using errcode = '23505';
  end if;
  insert into public.lease_amendments (household_id, lease_id, effective_period_start, changes, reason)
  values (
    v_lease.household_id, v_lease.id, p_effective_period_start,
    jsonb_strip_nulls(jsonb_build_object('rent_vnd', p_rent_vnd, 'billing_cycle_months', p_billing_cycle_months)),
    nullif(btrim(p_reason), '')
  )
  returning id into v_id;
  select min(a.effective_period_start) into v_stranded
  from public.lease_amendments a
  where a.lease_id = v_lease.id and a.effective_period_start not in (
    select s.period_start from private.lease_periods(v_lease, (select max(b.effective_period_start) from public.lease_amendments b where b.lease_id = v_lease.id)) s
  );
  if v_stranded is not null then
    raise exception '%', case when v_stranded = p_effective_period_start then 'ESTA_AMENDMENT_NOT_A_PERIOD_START' else 'ESTA_AMENDMENT_MOVES_LATER' end
      using errcode = '22023';
  end if;
  delete from public.invoices i where i.lease_id = v_lease.id and i.status = 'draft' and i.period_start >= p_effective_period_start;
  perform private.issue_invoices(v_lease.id, v_today, v_now);
  return v_id;
end;
$$;
revoke all on function public.amend_lease(uuid, date, bigint, integer, text) from public, anon;
grant execute on function public.amend_lease(uuid, date, bigint, integer, text) to authenticated;

-- LSE-2: active to terminated with a date and a reason. The lease now ends on that date: drafts reaching past it are
-- replanned to stop there, and the nightly job never issues a period that starts after it. A date before the start of an
-- issued invoice is refused, because that invoice cannot change.
create function public.terminate_lease(p_lease_id uuid, p_terminated_on date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease public.leases := private.member_lease(p_lease_id);
  v_now timestamptz := private.audit_now();
begin
  if v_lease.status <> 'active' then
    raise exception 'ESTA_LEASE_NOT_ACTIVE' using errcode = '55000';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'ESTA_TERMINATION_REASON' using errcode = '22023';
  end if;
  if p_terminated_on is null or p_terminated_on < v_lease.start_date or p_terminated_on > v_lease.end_date then
    raise exception 'ESTA_TERMINATION_DATE' using errcode = '22023';
  end if;
  if exists (select 1 from public.invoices i where i.lease_id = v_lease.id and i.status = 'issued' and i.period_start > p_terminated_on) then
    raise exception 'ESTA_TERMINATION_BEFORE_ISSUED' using errcode = '22023';
  end if;
  delete from public.invoices i where i.lease_id = v_lease.id and i.status = 'draft' and i.period_end > p_terminated_on;
  update public.leases l
  set status = 'terminated', terminated_on = p_terminated_on, end_date = p_terminated_on, termination_reason = btrim(p_reason)
  where l.id = v_lease.id;
  perform private.issue_invoices(v_lease.id, private.business_date(v_now), v_now);
end;
$$;
revoke all on function public.terminate_lease(uuid, date, text) from public, anon;
grant execute on function public.terminate_lease(uuid, date, text) to authenticated;

-- LSE-2 and SPEC §9.4 seed 7: a new active lease from the day after the old one ends, linked by renewal_of_lease_id, at
-- the old lease's last monthly rent changed by p_increase_bps and rounded half up to 100.000 ₫. It keeps the old terms
-- otherwise and bills like any activation. [app rule] An increase runs from -50% to +100%.
create function public.renew_lease(p_lease_id uuid, p_increase_bps integer, p_end_date date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.leases := private.member_lease(p_lease_id);
  v_now timestamptz := private.audit_now();
  v_last record;
  v_id uuid;
begin
  if v_old.status not in ('active', 'ended') then
    raise exception 'ESTA_LEASE_NOT_RENEWABLE' using errcode = '55000';
  end if;
  if v_old.end_date is null then
    raise exception 'ESTA_LEASE_OPEN_ENDED' using errcode = '55000';
  end if;
  if exists (select 1 from public.leases r where r.renewal_of_lease_id = v_old.id and r.status <> 'draft') then
    raise exception 'ESTA_LEASE_ALREADY_RENEWED' using errcode = '55000';
  end if;
  if p_increase_bps is null or p_increase_bps not between -5000 and 10000 then
    raise exception 'ESTA_RENEWAL_INCREASE' using errcode = '22023';
  end if;
  if p_end_date is not null and p_end_date <= v_old.end_date then
    raise exception 'ESTA_RENEWAL_END' using errcode = '22023';
  end if;
  select s.cycle_months, s.monthly_rent_vnd into v_last
  from private.lease_periods(v_old, v_old.end_date) s
  order by s.period_start desc
  limit 1;
  insert into public.leases (
    household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
    first_period_proration, due_offset_days, deposit_vnd, escalation, utilities_mode, tax_payer, declaring_party_id,
    notice_days, renewal_of_lease_id
  )
  values (
    v_old.household_id, v_old.property_id, v_old.unit_id, v_old.tenant_party_id, v_old.end_date + 1, p_end_date,
    private.scale_round_half_up(v_last.monthly_rent_vnd, 10000 + p_increase_bps, 10000, 100000), v_last.cycle_months,
    v_old.period_anchor, v_old.first_period_proration, v_old.due_offset_days, v_old.deposit_vnd, v_old.escalation,
    v_old.utilities_mode, v_old.tax_payer, v_old.declaring_party_id, v_old.notice_days, v_old.id
  )
  returning id into v_id;
  update public.leases l set status = 'active' where l.id = v_id;
  perform private.issue_invoices(v_id, private.business_date(v_now), v_now);
  return v_id;
end;
$$;
revoke all on function public.renew_lease(uuid, integer, date) from public, anon;
grant execute on function public.renew_lease(uuid, integer, date) to authenticated;

-- A lease's contract and handover papers sit under the lease (P3-08 lease detail).
alter table public.documents
  add column lease_id uuid,
  add constraint documents_lease_fk foreign key (household_id, lease_id) references public.leases (household_id, id) on delete set null (lease_id);
create index documents_lease_idx on public.documents (lease_id) where lease_id is not null and deleted_at is null;
