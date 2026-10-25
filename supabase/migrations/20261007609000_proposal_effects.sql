-- P5-06b: four more proposal types, and the database alone decides whether a proposal still applies (#331).
-- private.proposal_refusal reads the stored params and the records they name; create_proposal asks it through
-- public.proposal_refusal before storing, and approve_proposal asks it again under the item's row lock.

-- A lease or an amendment an approval wrote names its proposal once. Members insert leases directly, so a trigger keeps
-- the link to the approval; they have no write on lease_amendments at all.
alter table public.leases
  add column agent_item_id uuid unique,
  add constraint leases_agent_item_fk foreign key (household_id, agent_item_id) references public.agent_items (household_id, id) on delete set null (agent_item_id);
alter table public.lease_amendments
  add column agent_item_id uuid unique,
  add constraint lease_amendments_agent_item_fk foreign key (household_id, agent_item_id) references public.agent_items (household_id, id) on delete set null (agent_item_id);

create function private.refuse_member_agent_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.agent_item_id is not null then
    raise exception 'ESTA_AGENT_ITEM_LINK' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.refuse_member_agent_item() from public;
create trigger refuse_member_agent_item before insert on public.leases
  for each row execute function private.refuse_member_agent_item();

-- The SQL twin of packages/core/src/proposals PROPOSAL_TYPES: each param's JSON type, format and range, so every cast
-- below is safe and a row that does not match fails instead of raising.
create function private.param_text(p jsonb, k text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p -> k) = 'string' and btrim(p ->> k) <> '' and char_length(p ->> k) <= p_max;
$$;

create function private.param_uuid(p jsonb, k text, p_nullable boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p -> k)
    when 'string' then p ->> k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    when 'null' then p_nullable
    else p_nullable and not p ? k
  end;
$$;

create function private.param_date(p jsonb, k text, p_nullable boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case jsonb_typeof(p -> k)
    when 'string' then p ->> k ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(p ->> k, 'date')
    when 'null' then p_nullable
    else p_nullable and not p ? k
  end;
$$;

create function private.param_int(p jsonb, k text, p_min bigint, p_max bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p -> k) = 'number' and p ->> k ~ '^-?\d{1,13}$' and (p ->> k)::bigint between p_min and p_max;
$$;

create function private.proposal_params_ok(p_type text, p jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(p) = 'object' and private.param_text(p, 'title', 200) and case p_type
    when 'create_task' then p - array['title', 'due_on', 'property_id', 'lease_id'] = '{}'
      and private.param_date(p, 'due_on', true) and private.param_uuid(p, 'property_id', true) and private.param_uuid(p, 'lease_id', true)
    when 'flag_data_issue' then p - array['title', 'property_id', 'lease_id'] = '{}'
      and private.param_uuid(p, 'property_id', true) and private.param_uuid(p, 'lease_id', true)
    when 'draft_reminder' then p - array['title', 'lease_id'] = '{}' and private.param_uuid(p, 'lease_id', false)
    when 'suggest_rent_change' then p - array['title', 'lease_id', 'effective_period_start', 'rent_vnd'] = '{}'
      and private.param_uuid(p, 'lease_id', false) and private.param_date(p, 'effective_period_start', false)
      and private.param_int(p, 'rent_vnd', 1, 1000000000000)
    when 'suggest_lease_renewal' then p - array['title', 'lease_id', 'increase_bps', 'end_date'] = '{}'
      and private.param_uuid(p, 'lease_id', false) and private.param_int(p, 'increase_bps', -5000, 10000)
      and private.param_date(p, 'end_date', false)
    else false
  end, false);
$$;

revoke all on function private.param_text(jsonb, text, integer), private.param_uuid(jsonb, text, boolean),
  private.param_date(jsonb, text, boolean), private.param_int(jsonb, text, bigint, bigint), private.proposal_params_ok(text, jsonb)
  from public;

-- Null when the proposal applies on p_as_of, else the ESTA_* reason it does not: params out of shape, a subject that is
-- gone, outside the household or not on the named property, or a state its effect refuses. The rent change mirrors
-- amend_lease's checks, so a proposal is refused before Mẹ sees it rather than failing on her tap.
create function private.proposal_refusal(p_household_id uuid, p_proposal jsonb, p_as_of date)
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
      if not exists (select 1 from public.invoice_balances b where b.lease_id = v_lease.id and b.status = 'issued' and b.outstanding_vnd > 0) then
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

-- create_proposal's check, for the worker's service role only, on the database clock's business date.
create function public.proposal_refusal(p_household_id uuid, p_proposal jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.proposal_refusal(p_household_id, p_proposal, private.business_date(private.audit_now()));
$$;
revoke all on function public.proposal_refusal(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.proposal_refusal(uuid, jsonb) to service_role;

-- AGT-6 without a caller's verdict (#331): the item is locked, private.proposal_refusal decides under the lock, and the
-- effect lands as the member in the same transaction. An effect that refuses anyway, such as amend_lease after the
-- period was issued in between, rolls back to the savepoint and the item reads failed.
drop function public.approve_proposal(uuid, boolean);
create function public.approve_proposal(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.agent_items;
  p jsonb;
  v_now timestamptz := private.audit_now();
  v_refusal text;
  v_lease public.leases;
  v_effect uuid;
begin
  select * into v_item from public.agent_items i
  where i.id = p_item_id and i.kind = 'proposal'
    and private.is_member(i.household_id, 'member') and (i.audience = 'all' or private.is_operator(i.household_id))
  for update;
  if not found then
    raise exception 'ESTA_PROPOSAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_item.status in ('approved', 'failed') then
    return v_item.status;
  end if;
  if v_item.status not in ('new', 'read') then
    raise exception 'ESTA_PROPOSAL_DECIDED' using errcode = '55000';
  end if;

  p := v_item.proposal -> 'params';
  v_refusal := private.proposal_refusal(v_item.household_id, v_item.proposal, private.business_date(v_now));
  if v_refusal is null then
    begin
      case v_item.proposal ->> 'type'
        when 'create_task', 'flag_data_issue' then
          insert into public.tasks (household_id, property_id, lease_id, title, due_on, source, agent_item_id)
          values (
            v_item.household_id, (p ->> 'property_id')::uuid, (p ->> 'lease_id')::uuid, btrim(p ->> 'title'),
            (p ->> 'due_on')::date, 'agent_proposal', v_item.id
          );
        when 'suggest_rent_change' then
          v_effect := public.amend_lease((p ->> 'lease_id')::uuid, (p ->> 'effective_period_start')::date, (p ->> 'rent_vnd')::bigint);
          update public.lease_amendments a set agent_item_id = v_item.id where a.id = v_effect;
        when 'suggest_lease_renewal' then
          -- A draft from the day after the old lease ends, at renew_lease's rent, for Mẹ to review and activate.
          v_lease := private.member_lease((p ->> 'lease_id')::uuid);
          insert into public.leases (
            household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months,
            period_anchor, first_period_proration, due_offset_days, deposit_vnd, escalation, utilities_mode, tax_payer,
            declaring_party_id, notice_days, renewal_of_lease_id, agent_item_id
          )
          select
            v_lease.household_id, v_lease.property_id, v_lease.unit_id, v_lease.tenant_party_id, v_lease.end_date + 1,
            (p ->> 'end_date')::date,
            private.scale_round_half_up(s.monthly_rent_vnd, 10000 + (p ->> 'increase_bps')::integer, 10000, 100000),
            s.cycle_months, v_lease.period_anchor, v_lease.first_period_proration, v_lease.due_offset_days,
            v_lease.deposit_vnd, v_lease.escalation, v_lease.utilities_mode, v_lease.tax_payer, v_lease.declaring_party_id,
            v_lease.notice_days, v_lease.id, v_item.id
          from private.lease_periods(v_lease, v_lease.end_date) s
          order by s.period_start desc
          limit 1;
          if not found then
            v_refusal := 'ESTA_LEASE_NOT_RENEWABLE';
          end if;
        when 'draft_reminder' then
          -- Esta drafts the reminder in the browser from the bill (P3-13) and sends nothing; approving records the decision.
          null;
      end case;
    exception
      when sqlstate '22023' or sqlstate '55000' or sqlstate '23505' or sqlstate '23514' or sqlstate '23503' or sqlstate '23P01' or sqlstate 'P0002' then
        v_refusal := sqlerrm;
    end;
  end if;

  update public.agent_items
  set status = case when v_refusal is null then 'approved' else 'failed' end, decided_by = (select auth.uid()), decided_at = v_now
  where id = v_item.id;
  return case when v_refusal is null then 'approved' else 'failed' end;
end;
$$;
revoke all on function public.approve_proposal(uuid) from public, anon;
grant execute on function public.approve_proposal(uuid) to authenticated;
