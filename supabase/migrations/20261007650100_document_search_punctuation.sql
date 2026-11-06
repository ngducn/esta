-- The vault search finds a name or a figure typed with dots, dashes or slashes (#151). The index kept `q.7`, `so.do.pdf`
-- and `07/10/2026` as single words while the query splits the typed text on every run of non-alphanumeric characters, so
-- `Q.7` never matched. The vector now splits its text the same way, and the stored column is rebuilt so documents read
-- before this migration are found too.
create or replace function private.document_search_vector(p_title text, p_tags text[], p_ocr_text text)
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select setweight(to_tsvector('simple'::regconfig, regexp_replace(public.esta_unaccent(p_title), '[^[:alnum:]]+', ' ', 'g')), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(regexp_replace(public.esta_unaccent(array_to_string(p_tags, ' ')), '[^[:alnum:]]+', ' ', 'g'), '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(regexp_replace(public.esta_unaccent(p_ocr_text), '[^[:alnum:]]+', ' ', 'g'), '')), 'C');
$$;

drop index public.documents_search_vector_idx;
alter table public.documents drop column search_vector;
alter table public.documents
  add column search_vector tsvector generated always as (private.document_search_vector(title, tags, ocr_text)) stored;
create index documents_search_vector_idx on public.documents using gin (search_vector);
