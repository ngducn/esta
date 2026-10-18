-- The documents vault search (SPEC §5.5, DOC-3). ocr_text holds the text the assistant read from a normal document,
-- copied on review acceptance; search_vector covers it with the title and tags, accent-insensitive.

-- SPEC D11: the same rule as the extraction CHECK, so search text can never hold a full national ID. A sensitive
-- document keeps no text at all.
alter table public.documents
  add column ocr_text text,
  add constraint documents_ocr_text_no_national_id check (not private.holds_national_id(to_jsonb(ocr_text))),
  add constraint documents_ocr_text_normal_only check (ocr_text is null or sensitivity = 'normal');

-- The title weighs most, then tags, then the read text, so a title match ranks first. array_to_string is only stable,
-- so the tags are joined here, where the whole expression can be declared immutable for the generated column.
create function private.document_search_vector(p_title text, p_tags text[], p_ocr_text text)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select setweight(to_tsvector('simple'::regconfig, public.esta_unaccent(p_title)), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(public.esta_unaccent(array_to_string(p_tags, ' ')), '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(public.esta_unaccent(p_ocr_text), '')), 'C');
$$;
revoke all on function private.document_search_vector(text, text[], text) from public;
grant execute on function private.document_search_vector(text, text[], text) to authenticated, service_role;

alter table public.documents
  add column search_vector tsvector generated always as (private.document_search_vector(title, tags, ocr_text)) stored;
create index documents_search_vector_idx on public.documents using gin (search_vector);

-- Each word of the query, unaccented, becomes a prefix term and the terms are joined by AND, so `bao loc so` finds
-- `Sổ hồng Bảo Lộc`. Security invoker: RLS on documents keeps the rows inside the caller's households.
create function public.search_documents(p_query text)
returns setof public.documents
language sql
stable
security invoker
set search_path = ''
as $$
  with query as (
    select to_tsquery('simple'::regconfig, string_agg(term || ':*', ' & ')) as terms
    from regexp_split_to_table(public.esta_unaccent(coalesce(p_query, '')), '[^[:alnum:]]+') as term
    where term <> ''
  )
  select d.*
  from public.documents d
  cross join query
  where query.terms is not null
    and d.deleted_at is null
    and d.search_vector @@ query.terms
  order by ts_rank(d.search_vector, query.terms) desc, d.title, d.id;
$$;
revoke all on function public.search_documents(text) from public, anon;
grant execute on function public.search_documents(text) to authenticated, service_role;
