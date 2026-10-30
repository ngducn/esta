-- Two checks a proposal now passes before Mẹ sees it (#333). [app rule] A rent change keeps the new monthly rent
-- between half and double the one it replaces, the bounds of a renewal's increase, so a slip such as 1.000 ₫ never
-- reaches her; from a lease's first period it replaces the lease's own rent. A reminder needs a bill still owed on this
-- month's Thu tiền board, asked of the board itself, so the approved card has one to open: a bill issued early and due
-- next month is not on it yet.
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
        select 1 from public.invoices i where i.lease_id = v_lease.id and i.status = 'issued' and i.period_end >= v_start
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
