-- SPEC D11 for every path that writes typed text, not only the assistant's (#147).
--
-- The judge reads a middle dot as a dot, so it groups an amount or a date as a dot does, and matches ID labels with
-- accents dropped, so `CḾND`, OCR's `CMNĐ` and `Chung minh nhan dan` announce an ID as `CMND` does (#140). It drops the
-- marks reduceNationalIds drops and recomposes what is left, so a letter neither can fold, such as a Hangul syllable,
-- counts as one character in both.
create or replace function private.holds_national_id(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_or(
    folded ~* '(cccd|cmtnd|cmnd|cmt|can cuoc|chung minh|dinh danh|ddcn|so the|\yid\y).{0,40}(?<![0-9])(?<![0-9]\.)[0-9](?:(?:[[:space:]]{1,3}|[./,_\u2010-\u2015-])?[0-9]){8,11}(?![0-9])(?!\.[0-9])'
    or plain ~* '(?<![0-9])(?<![0-9]\.)(?<![^[:alpha:]](?:pa|pb|pc|pd|pe))[0-9](?:(?:[ \t\u000B\u000C\u1680\u2028\u2029]{1,3}|\r?\n|[.,_\u2010-\u2015-])?[0-9]){11}(?![0-9])(?!\.[0-9])'
  ), false)
  from jsonb_path_query(coalesce(p_value, 'null'::jsonb), 'strict $.**') as scalar
  cross join lateral (
    select private.blank_matches(
      private.blank_matches(
        ' ' || translate(regexp_replace(normalize(scalar #>> '{}', NFKC), '[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]', '', 'g'), '·', '.') || ' ',
        '(?<![0-9])(?:(?:0?[1-9]|[12][0-9]|3[01])([./-])(?:0?[1-9]|1[0-2])\1(?:19|20)?[0-9]{2}|(?:19|20)[0-9]{2}([./-])(?:0?[1-9]|1[0-2])\2(?:0?[1-9]|[12][0-9]|3[01])|(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01]))(?![0-9])', ''),
      '(?<![0-9])(?<![0-9][.,])[1-9][0-9]{0,2}(?:(?:\.[0-9]{3})+|(?:,[0-9]{3})+)?(?![0-9])(?![.,][0-9])(?=[[:space:]]?(?:đ|đồng|vnd|vnđ)(?![[:alnum:]]))', 'i') as plain
  ) as cleaned
  cross join lateral (
    select translate(normalize(regexp_replace(normalize(plain, NFD), '[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]', '', 'g'), NFC), 'đĐ', 'dD') as folded
  ) as unaccented
  where jsonb_typeof(scalar) in ('string', 'number');
$$;

-- Every free-text column Mẹ can type into refuses a full ID by the same rule, through any form or a direct write.
-- NOT VALID: rows written before this migration are not read, and a row is judged again whenever it is written.
alter table public.parcels
  add constraint parcels_no_national_id check (not private.holds_national_id(
    jsonb_build_array(parcel_no, map_sheet_no, origin_text, jsonb_path_query_array(purposes, '$[*].land_use_code'))
  )) not valid;
alter table public.certificates
  add constraint certificates_no_national_id check (not private.holds_national_id(
    jsonb_build_array(serial_no, book_entry_no, issued_by, jsonb_path_query_array(annotations, '$[*].text'))
  )) not valid;
alter table public.structures
  add constraint structures_no_national_id check (not private.holds_national_id(
    jsonb_build_array(kind, structure_text, ownership_term)
  )) not valid;
alter table public.parties
  add constraint parties_no_national_id check (not private.holds_national_id(
    jsonb_build_array(full_name, short_name, email, tax_code, address_text, notes)
  )) not valid;
alter table public.documents
  add constraint documents_title_no_national_id check (not private.holds_national_id(jsonb_build_array(title, tags))) not valid;

-- A landline in E.164, such as +842838123456, has 12 digits like a CCCD, so the judge cannot read a phone. A phone
-- column holds only what normalizePhone writes, and no CCCD fits that shape: every CCCD starts with 0.
alter table public.parties
  add constraint parties_phone_e164 check (
    (phone is null or phone ~ '^\+84(?:[35789][0-9]{8}|2[0-9]{9})$')
    and (zalo_phone is null or zalo_phone ~ '^\+84(?:[35789][0-9]{8}|2[0-9]{9})$')
  ) not valid;
