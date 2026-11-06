-- #468. A lease change may not start inside a voided bill's period, as it may not inside an issued one: a voided bill keeps
-- its days, so the nightly job never bills them again and a quarterly bill over a voided November left December and
-- January unbilled. Both checks now count issued and void bills (amend_lease and the assistant's proposal check).
create or replace function public.amend_lease(
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
    select 1 from public.invoices i where i.lease_id = v_lease.id and i.status in ('issued', 'void') and i.period_end >= p_effective_period_start
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
  if v_lease.utilities_mode = 'metered_by_owner' and not private.meter_credit_fits(v_lease, v_now) then
    raise exception 'ESTA_LEASE_METER_CREDIT_TOO_LARGE' using errcode = '55000';
  end if;
  return v_id;
end;
$$;
revoke all on function public.amend_lease(uuid, date, bigint, integer, text) from public, anon;
grant execute on function public.amend_lease(uuid, date, bigint, integer, text) to authenticated;

create or replace function private.proposal_refusal(p_household_id uuid, p_proposal jsonb, p_as_of date)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_type text := p_proposal ->> 'type';
  p jsonb := p_proposal -> 'params';
  v_property uuid;
  v_lease public.leases;
  v_start date;
  v_rent bigint;
begin
  if jsonb_typeof(p_proposal) <> 'object' or not private.proposal_params_ok(v_type, p) then
    return 'ESTA_PROPOSAL_PARAMS';
  end if;
  v_property := (p ->> 'property_id')::uuid;
  if v_property is not null and not exists (
    select 1 from public.properties pr where pr.household_id = p_household_id and pr.id = v_property and pr.deleted_at is null
  ) then
    return 'ESTA_PROPOSAL_SUBJECT';
  end if;
  if p ->> 'lease_id' is not null then
    select l.* into v_lease from public.leases l
    join public.properties pr on pr.id = l.property_id and pr.deleted_at is null
    where l.household_id = p_household_id and l.id = (p ->> 'lease_id')::uuid and l.property_id = coalesce(v_property, l.property_id);
    if not found then
      return 'ESTA_PROPOSAL_SUBJECT';
    end if;
  end if;

  case v_type
    when 'create_task', 'flag_data_issue' then
      if v_lease.id is not null and v_lease.status not in ('draft', 'active') then
        return 'ESTA_LEASE_NOT_ACTIVE';
      end if;
    when 'draft_reminder' then
      if v_lease.status <> 'active' then
        return 'ESTA_LEASE_NOT_ACTIVE';
      end if;
      if not exists (
        select 1 from public.collection_candidates(p_as_of) c where c.lease_id = v_lease.id and c.outstanding_vnd > 0
      ) then
        return 'ESTA_REMINDER_NOTHING_OWED';
      end if;
    when 'suggest_rent_change' then
      v_start := (p ->> 'effective_period_start')::date;
      if v_lease.status <> 'active' then
        return 'ESTA_LEASE_NOT_ACTIVE';
      end if;
      if v_start <= p_as_of then
        return 'ESTA_AMENDMENT_NOT_AFTER_AS_OF';
      end if;
      if v_start <= v_lease.paid_through_date or exists (
        select 1 from public.invoices i where i.lease_id = v_lease.id and i.status in ('issued', 'void') and i.period_end >= v_start
      ) then
        return 'ESTA_AMENDMENT_ALREADY_BILLED';
      end if;
      if exists (select 1 from public.lease_amendments a where a.lease_id = v_lease.id and a.effective_period_start = v_start) then
        return 'ESTA_AMENDMENT_DUPLICATE';
      end if;
      if not exists (select 1 from private.lease_periods(v_lease, v_start) s where s.period_start = v_start) then
        return 'ESTA_AMENDMENT_NOT_A_PERIOD_START';
      end if;
      select s.monthly_rent_vnd into v_rent from private.lease_periods(v_lease, v_start) s
      where s.period_start < v_start order by s.period_start desc limit 1;
      v_rent := coalesce(v_rent, v_lease.rent_vnd);
      if (p ->> 'rent_vnd')::bigint * 2 < v_rent or (p ->> 'rent_vnd')::bigint > v_rent * 2 then
        return 'ESTA_RENT_CHANGE_RANGE';
      end if;
    when 'suggest_lease_renewal' then
      if v_lease.status not in ('active', 'ended') then
        return 'ESTA_LEASE_NOT_RENEWABLE';
      end if;
      if v_lease.end_date is null then
        return 'ESTA_LEASE_OPEN_ENDED';
      end if;
      if exists (select 1 from public.leases r where r.renewal_of_lease_id = v_lease.id) then
        return 'ESTA_LEASE_ALREADY_RENEWED';
      end if;
      if (p ->> 'end_date')::date <= v_lease.end_date then
        return 'ESTA_RENEWAL_END';
      end if;
  end case;
  return null;
end;
$$;
revoke all on function private.proposal_refusal(uuid, jsonb, date) from public;
