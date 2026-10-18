-- The one judge of SPEC D11 for a review save (DOC-6). Before it writes any row, the save sends every value it would
-- write and gets back the zero-based positions of those the extraction CHECK would refuse, by that CHECK's own rule, so
-- a refused save writes nothing. Security invoker and immutable: it reads no table and runs as the member.
create function public.national_id_indexes(p_values jsonb)
returns integer[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg((value.position - 1)::integer order by value.position), '{}')
  from jsonb_array_elements(p_values) with ordinality as value (item, position)
  where private.holds_national_id(value.item);
$$;
revoke all on function public.national_id_indexes(jsonb) from public, anon;
grant execute on function public.national_id_indexes(jsonb) to authenticated, service_role;
