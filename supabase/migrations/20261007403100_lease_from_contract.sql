-- P3-19: a lease contract is read into lease_v1, and a lease created from it keeps the contract (DOC-6, SPEC §5.4).

alter table public.document_extractions drop constraint document_extractions_schema_name_check;
alter table public.document_extractions
  add constraint document_extractions_schema_name_check check (schema_name in ('certificate_v1', 'utility_bill_v1', 'lease_v1'));

create function private.extraction_schema(p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'certificate' then 'certificate_v1'
    when 'utility_bill' then 'utility_bill_v1'
    when 'lease_contract' then 'lease_v1'
  end;
$$;
revoke all on function private.extraction_schema(text) from public;
grant execute on function private.extraction_schema(text) to authenticated, service_role;

drop policy agent_jobs_insert_extract on public.agent_jobs;
create policy agent_jobs_insert_extract on public.agent_jobs
  for insert to authenticated
  with check (
    kind = 'extract_document'
    and requested_by = (select auth.uid())
    and private.is_member(household_id, 'member')
    and exists (
      select 1
      from public.documents d
      where d.household_id = agent_jobs.household_id
        and d.id::text = agent_jobs.payload ->> 'document_id'
        and d.deleted_at is null
        and private.extraction_schema(d.category) is not null
        and agent_jobs.idempotency_key = 'extract_document:' || d.id || ':' || d.sha256
    )
  );

create or replace function public.enqueue_extract_document(p_document_id uuid, p_as_of timestamptz)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_document record;
  v_schema text;
  v_job_id uuid := gen_random_uuid();
  v_extraction_id uuid := gen_random_uuid();
begin
  select d.id, d.household_id, d.category, d.sha256
  into v_document
  from public.documents d
  where d.id = p_document_id and d.deleted_at is null;
  if not found then
    return null;
  end if;

  v_schema := private.extraction_schema(v_document.category);
  if v_schema is null then
    return null;
  end if;

  if exists (select 1 from public.document_extractions x where x.household_id = v_document.household_id and x.document_id = v_document.id) then
    return private.latest_extraction(v_document.household_id, v_document.id);
  end if;

  begin
    insert into public.agent_jobs (id, household_id, kind, payload, idempotency_key, run_after, requested_by)
    values (
      v_job_id,
      v_document.household_id,
      'extract_document',
      jsonb_build_object('document_id', v_document.id, 'extraction_id', v_extraction_id),
      'extract_document:' || v_document.id || ':' || v_document.sha256,
      p_as_of,
      auth.uid()
    );
  exception when unique_violation then
    return private.latest_extraction(v_document.household_id, v_document.id);
  end;

  insert into public.document_extractions (id, household_id, document_id, schema_name, schema_version, job_id)
  values (v_extraction_id, v_document.household_id, v_document.id, v_schema, 1, v_job_id);
  return v_extraction_id;
end;
$$;

-- The one insert of a draft lease. With p_document_id, that lease contract joins the lease in the same transaction; it
-- must be on the same property and belong to no lease yet, or the insert is undone with ESTA_LEASE_DOCUMENT.
create function public.create_lease(p_household_id uuid, p_id uuid, p_lease jsonb, p_document_id uuid default null)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v public.leases := jsonb_populate_record(null::public.leases, p_lease);
begin
  insert into public.leases (
    id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months,
    period_anchor, first_period_proration, due_offset_days, deposit_vnd, escalation, utilities_mode, tax_payer,
    notice_days, paid_through_date, status
  )
  values (
    p_id, p_household_id, v.property_id, v.unit_id, v.tenant_party_id, v.start_date, v.end_date, v.rent_vnd,
    v.billing_cycle_months, v.period_anchor, v.first_period_proration, 0, v.deposit_vnd, v.escalation,
    v.utilities_mode, v.tax_payer, v.notice_days, null, 'draft'
  );

  if p_document_id is not null then
    update public.documents d
    set lease_id = p_id
    where d.household_id = p_household_id
      and d.id = p_document_id
      and d.property_id = v.property_id
      and d.category = 'lease_contract'
      and d.lease_id is null
      and d.deleted_at is null;
    if not found then
      raise exception 'ESTA_LEASE_DOCUMENT' using errcode = '23514';
    end if;
  end if;
  return p_id;
end;
$$;
revoke all on function public.create_lease(uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function public.create_lease(uuid, uuid, jsonb, uuid) to authenticated;
