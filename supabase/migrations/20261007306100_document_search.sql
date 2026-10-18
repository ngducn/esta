-- The documents vault search (SPEC §5.5, DOC-3). ocr_text holds the text the assistant read from a normal document,
-- copied on review acceptance; search_vector covers it with the title and tags, accent-insensitive.

-- The search index unaccents its text, which strips combining marks, so a mark between two digit groups would hide
-- from the judge an ID the index then holds whole. The judge drops combining marks with the invisible characters
-- before it looks, as reduceNationalIds does, and a middle dot joins groups as a dot does. Every CHECK and the review
-- save's judge call this one function.
create or replace function private.holds_national_id(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_or(
    plain ~* '(cccd|cmtnd|cmnd|cmt|căn cước|chứng minh|định danh|đdcn|số thẻ|\yid\y).{0,40}(?<![0-9])(?<![0-9]\.)[0-9](?:(?:[[:space:]]{1,3}|[./,_\u00B7\u2010-\u2015-])?[0-9]){8,11}(?![0-9])(?!\.[0-9])'
    or plain ~* '(?<![0-9])(?<![0-9]\.)(?<![^[:alpha:]](?:pa|pb|pc|pd|pe))[0-9](?:(?:[ \t\u000B\u000C\u1680\u2028\u2029]{1,3}|\r?\n|[.,_\u00B7\u2010-\u2015-])?[0-9]){11}(?![0-9])(?!\.[0-9])'
  ), false)
  from jsonb_path_query(coalesce(p_value, 'null'::jsonb), 'strict $.**') as scalar
  cross join lateral (
    select private.blank_matches(
      private.blank_matches(
        ' ' || regexp_replace(normalize(scalar #>> '{}', NFKC), '[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]', '', 'g') || ' ',
        '(?<![0-9])(?:(?:0?[1-9]|[12][0-9]|3[01])([./-])(?:0?[1-9]|1[0-2])\1(?:19|20)?[0-9]{2}|(?:19|20)[0-9]{2}([./-])(?:0?[1-9]|1[0-2])\2(?:0?[1-9]|[12][0-9]|3[01])|(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01]))(?![0-9])', ''),
      '(?<![0-9])(?<![0-9][.,])[1-9][0-9]{0,2}(?:(?:\.[0-9]{3})+|(?:,[0-9]{3})+)?(?![0-9])(?![.,][0-9])(?=[[:space:]]?(?:đ|đồng|vnd|vnđ)(?![[:alnum:]]))', 'i') as plain
  ) as cleaned
  where jsonb_typeof(scalar) in ('string', 'number');
$$;

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
