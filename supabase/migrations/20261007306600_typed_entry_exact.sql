-- SPEC D11: an accepted_fields entry escapes the national ID judge only when its decision is exactly the JSON string
-- "edited"; any other decision, or none, is judged. An audit diff side is JSON null when the column was null, so a
-- non-object is returned whole for the judge to read.
create or replace function private.read_entries(p_accepted_fields jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p_accepted_fields)
    when 'object' then (
      select coalesce(jsonb_agg(entry.value), '[]'::jsonb)
      from jsonb_each(p_accepted_fields) as entry
      where entry.value -> 'decision' is distinct from '"edited"'::jsonb
    )
    else p_accepted_fields
  end;
$$;
