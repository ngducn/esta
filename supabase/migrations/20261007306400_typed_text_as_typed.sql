-- SPEC D11, amended 2026-10-19 by Ryan's ruling: text a person types is saved as typed, full ID numbers included, and
-- what the assistant reads keeps only the last four digits. An accepted_fields entry marked `edited` holds what Mẹ
-- typed; every other entry, a malformed one included, holds a value the assistant read and stays judged.
create function private.read_entries(p_accepted_fields jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_path_query_array(p_accepted_fields, '$.* ? (!(@.decision == "edited"))');
$$;
revoke all on function private.read_entries(jsonb) from public;
grant execute on function private.read_entries(jsonb) to authenticated, service_role;

alter table public.document_extractions
  drop constraint document_extractions_no_national_id,
  add constraint document_extractions_no_national_id
    check (not private.holds_national_id(result) and not private.holds_national_id(private.read_entries(accepted_fields)));

alter table public.audit_log
  drop constraint audit_log_extraction_no_national_id,
  add constraint audit_log_extraction_no_national_id
  check (
    table_name <> 'document_extractions'
    or not (
      private.holds_national_id(diff -> 'result')
      or private.holds_national_id(private.read_entries(diff -> 'accepted_fields' -> 'old'))
      or private.holds_national_id(private.read_entries(diff -> 'accepted_fields' -> 'new'))
    )
  );
