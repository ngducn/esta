-- Accepting what the assistant read from a document (DOC-6, issue #184). The review used to write each party, the
-- certificate, its parcels and structures, the document and the extraction as separate calls, so a failure halfway left
-- some saved, and two accepts at once interleaved. accept_extraction writes all of it in one transaction under a lock on
-- the extraction row, like record_payment: the plan is TypeScript's (packages/core PLANNERS), the writes are this
-- function's, and every row lands in the extraction's household and the document's property whatever the plan says.

create function public.accept_extraction(
  p_extraction_id uuid,
  p_steps jsonb,
  p_accepted_fields jsonb,
  p_property_id uuid default null,
  p_ocr_text text default null
)
returns table (property_id uuid, document_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_x public.document_extractions;
  v_target uuid;
  v_document public.documents;
  v_property uuid;
  v_step jsonb;
begin
  -- The lock makes two accepts of one extraction take turns, so the second rewrites what the first wrote or is refused.
  select x.* into v_x from public.document_extractions x where x.id = p_extraction_id for update;
  if not found or not private.is_member(v_x.household_id, 'viewer') then
    raise exception 'ESTA_EXTRACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.is_member(v_x.household_id, 'member') then
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_steps) is distinct from 'array' or jsonb_typeof(p_accepted_fields) is distinct from 'object'
    or v_x.status not in ('needs_review', 'accepted', 'failed') then
    raise exception 'ESTA_EXTRACTION_NOT_REVIEWABLE' using errcode = '23514';
  end if;

  -- A failed read is replaced by a manual entry whose id the stored read decides, never the caller.
  v_target := case when v_x.status = 'failed'
    then extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'manual:' || v_x.id) else v_x.id end;

  select d.* into v_document from public.documents d
  where d.household_id = v_x.household_id and d.id = v_x.document_id and d.deleted_at is null;
  if not found then
    raise exception 'ESTA_EXTRACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_property := coalesce(v_document.property_id, p_property_id);
  if v_property is null then
    raise exception 'ESTA_NO_PROPERTY' using errcode = '23514';
  end if;
  if not exists (select from public.properties p where p.household_id = v_x.household_id and p.id = v_property and p.deleted_at is null) then
    raise exception 'ESTA_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_document.property_id is null then
    update public.documents set property_id = v_property where id = v_document.id;
  end if;

  -- A failed read is saved as a manual entry, inserted accepted with no model before its rows so the certificate can name it.
  if v_x.status = 'failed' then
    insert into public.document_extractions (id, household_id, document_id, schema_name, schema_version, status, accepted_fields)
    values (v_target, v_x.household_id, v_x.document_id, v_x.schema_name, 1, 'accepted', p_accepted_fields)
    on conflict (id) do nothing;
  end if;

  for v_step in select s.value from jsonb_array_elements(p_steps) s loop
    case v_step ->> 'table'
      when 'parties' then
        insert into public.parties (id, household_id, kind, full_name, id_last4, address_text, tags)
        select r.id, v_x.household_id, r.kind, r.full_name, r.id_last4, r.address_text, r.tags
        from jsonb_populate_record(null::public.parties, v_step -> 'row') r
        on conflict (id) do update
          set kind = excluded.kind, full_name = excluded.full_name, id_last4 = excluded.id_last4,
              address_text = excluded.address_text, tags = excluded.tags
          where public.parties.household_id = excluded.household_id;
      when 'certificates' then
        insert into public.certificates (id, household_id, property_id, form, serial_no, book_entry_no, issued_on, issued_by, holder_party_ids, annotations, document_id, extraction_id)
        select r.id, v_x.household_id, v_property, r.form, r.serial_no, r.book_entry_no, r.issued_on, r.issued_by, r.holder_party_ids, r.annotations, v_x.document_id, v_target
        from jsonb_populate_record(null::public.certificates, v_step -> 'row') r
        on conflict (id) do update
          set property_id = excluded.property_id, form = excluded.form, serial_no = excluded.serial_no, book_entry_no = excluded.book_entry_no,
              issued_on = excluded.issued_on, issued_by = excluded.issued_by, holder_party_ids = excluded.holder_party_ids,
              annotations = excluded.annotations, document_id = excluded.document_id, extraction_id = excluded.extraction_id
          where public.certificates.household_id = excluded.household_id;
      when 'parcels' then
        insert into public.parcels (id, household_id, property_id, certificate_id, parcel_no, map_sheet_no, area_m2, use_form, purposes, origin_text)
        select r.id, v_x.household_id, v_property, r.certificate_id, r.parcel_no, r.map_sheet_no, r.area_m2, r.use_form, r.purposes, r.origin_text
        from jsonb_populate_record(null::public.parcels, v_step -> 'row') r
        on conflict (id) do update
          set property_id = excluded.property_id, certificate_id = excluded.certificate_id, parcel_no = excluded.parcel_no,
              map_sheet_no = excluded.map_sheet_no, area_m2 = excluded.area_m2, use_form = excluded.use_form,
              purposes = excluded.purposes, origin_text = excluded.origin_text
          where public.parcels.household_id = excluded.household_id;
      when 'structures' then
        insert into public.structures (id, household_id, property_id, certificate_id, kind, footprint_m2, floor_area_m2, floors, structure_text, completed_year, ownership_term)
        select r.id, v_x.household_id, v_property, r.certificate_id, r.kind, r.footprint_m2, r.floor_area_m2, r.floors, r.structure_text, r.completed_year, r.ownership_term
        from jsonb_populate_record(null::public.structures, v_step -> 'row') r
        on conflict (id) do update
          set property_id = excluded.property_id, certificate_id = excluded.certificate_id, kind = excluded.kind,
              footprint_m2 = excluded.footprint_m2, floor_area_m2 = excluded.floor_area_m2, floors = excluded.floors,
              structure_text = excluded.structure_text, completed_year = excluded.completed_year, ownership_term = excluded.ownership_term
          where public.structures.household_id = excluded.household_id;
      when 'utility_accounts' then
        insert into public.utility_accounts (id, household_id, property_id, unit_id, kind, provider, customer_code, holder_name, note)
        select r.id, v_x.household_id, v_property, r.unit_id, r.kind, r.provider, r.customer_code, r.holder_name, r.note
        from jsonb_populate_record(null::public.utility_accounts, v_step -> 'row') r
        on conflict (id) do update
          set property_id = excluded.property_id, unit_id = excluded.unit_id, kind = excluded.kind, provider = excluded.provider,
              customer_code = excluded.customer_code, holder_name = excluded.holder_name, note = excluded.note
          where public.utility_accounts.household_id = excluded.household_id;
      when 'properties' then
        update public.properties
        set certificate_address_text = (select r.certificate_address_text from jsonb_populate_record(null::public.properties, v_step -> 'row') r)
        where id = v_property and household_id = v_x.household_id;
      else
        raise exception 'ESTA_EXTRACTION_STEP' using errcode = '22023';
    end case;
  end loop;

  if p_ocr_text is not null then
    update public.documents set ocr_text = p_ocr_text where id = v_document.id;
  end if;

  update public.document_extractions
  set status = 'accepted', accepted_fields = p_accepted_fields
  where id = v_target and household_id = v_x.household_id and document_id = v_x.document_id and status in ('needs_review', 'accepted');
  if not found then
    raise exception 'ESTA_EXTRACTION_NOT_REVIEWABLE' using errcode = '23514';
  end if;

  update public.agent_items
  set status = 'done'
  where household_id = v_x.household_id
    and dedupe_key in ('extract_review:' || p_extraction_id, 'extract_failed:' || p_extraction_id)
    and status = 'new'
    and (audience = 'all' or private.is_operator(v_x.household_id));

  return query select v_property, v_x.document_id;
end;
$$;
revoke all on function public.accept_extraction(uuid, jsonb, jsonb, uuid, text) from public, anon;
grant execute on function public.accept_extraction(uuid, jsonb, jsonb, uuid, text) to authenticated;

-- `Không dùng`: the read is set aside and the Trợ lý item that pointed at it leaves the new list, together or not at all.
-- Under the same lock as accept_extraction, so a reject racing an accept finds the accept's result. Returns the
-- document's id, or nothing when the read is no longer waiting.
create function public.reject_extraction(p_extraction_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x public.document_extractions;
begin
  select x.* into v_x from public.document_extractions x where x.id = p_extraction_id for update;
  if not found or not private.is_member(v_x.household_id, 'viewer') then
    raise exception 'ESTA_EXTRACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not private.is_member(v_x.household_id, 'member') then
    raise exception 'ESTA_FORBIDDEN' using errcode = '42501';
  end if;
  if v_x.status <> 'needs_review' then
    return null;
  end if;
  update public.document_extractions set status = 'rejected' where id = v_x.id;
  update public.agent_items
  set status = 'done'
  where household_id = v_x.household_id and dedupe_key = 'extract_review:' || v_x.id and status = 'new'
    and (audience = 'all' or private.is_operator(v_x.household_id));
  return v_x.document_id;
end;
$$;
revoke all on function public.reject_extraction(uuid) from public, anon;
grant execute on function public.reject_extraction(uuid) to authenticated;
