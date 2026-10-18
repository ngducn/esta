-- Accepting an extraction (DOC-6). The review writes parties, the certificate, its parcels and structures, or one
-- utility account, under the member's session with ids derived from the extraction, then marks the extraction accepted.

-- One extraction yields one certificate, however many times its review is saved.
create unique index certificates_extraction_idx on public.certificates (extraction_id) where extraction_id is not null;

-- Manual entry: a member inserts the extraction already accepted, and only after the assistant failed to read the
-- document. Nobody inserts any other state but queued, so a row with a model or a result is always the worker's.
create function private.check_extraction_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'queued' then
    return new;
  end if;
  if new.status <> 'accepted' or new.model is not null or new.job_id is not null or new.result is not null
    or new.field_confidence is not null or new.accepted_fields is null
    or (
      select x.status
      from public.document_extractions x
      where x.household_id = new.household_id and x.document_id = new.document_id and x.id <> new.id
      order by x.created_at desc, x.id desc
      limit 1
    ) is distinct from 'failed'
  then
    raise exception 'document_extractions: only a manual entry after a failed read is inserted as %', new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.check_extraction_insert() from public;

create trigger check_extraction_insert
  before insert on public.document_extractions
  for each row execute function private.check_extraction_insert();

-- The reviewer is the member who accepts or rejects, at the audit clock, never what the client sends. Security definer
-- to read that clock, so the caller's role comes from the request claims, as stamp_certificate_verified reads it.
create function private.stamp_extraction_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  elsif new.status in ('accepted', 'rejected') then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := private.audit_now();
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_extraction_review() from public;

create trigger stamp_extraction_review
  before insert or update on public.document_extractions
  for each row execute function private.stamp_extraction_review();

grant insert (status, accepted_fields) on table public.document_extractions to authenticated;
revoke update (reviewed_by, reviewed_at) on table public.document_extractions from authenticated;
