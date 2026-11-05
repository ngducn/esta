-- SPEC D11 backstop, one pass. Three changes to the check that 20261007625000 made, and the speed fix for #140.
-- An amount with thousands groups stays an amount after digits and spaces (`1 125.000.000.000 đồng`); only a bare
-- 1- to 3-digit amount continues digits before it. A middle dot reads as a separator in a date and in thousands
-- groups. A phone (10 digits starting with 0, or after a plus sign), or a number right after a label for a phone, a tax
-- code or an account, is not an ID when it only stands before an ID label.
-- Speed: `blank_matches` found the n-th match by scanning from the start for every match, so a text with many dates
-- and amounts took quadratic time and a review save could exceed the 8 s timeout of the member's session.
-- `blank_matches_once` splits and matches in one scan each. Its pattern is wrapped in a group, so a back-reference in
-- the pattern counts from 2. The amount pattern has no lookbehind longer than one character, which Postgres evaluates by
-- scanning from the start of the text for every candidate (quadratic); a separator or the spaces before a bare amount
-- are matched instead, so they are blanked with it. `offset 0` keeps the cleaned text from being computed once per use.
create function private.blank_matches_once(p_text text, p_pattern text, p_flags text)
returns text
language sql
immutable
set search_path = ''
as $$
  with scanned as (
    select
      regexp_split_to_array(p_text, '(' || p_pattern || ')', p_flags) as pieces,
      array(select hit[1] from regexp_matches(p_text, '(' || p_pattern || ')', 'g' || p_flags) as hit) as hits
  )
  select coalesce(string_agg(piece || coalesce(repeat('#', length(hits[n])), ''), '' order by n), p_text)
  from scanned, unnest(pieces) with ordinality as piece_at(piece, n);
$$;
revoke all on function private.blank_matches_once(text, text, text) from public;
grant execute on function private.blank_matches_once(text, text, text) to authenticated, service_role;

create or replace function private.holds_national_id(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_or(
    plain ~* '(c\.?c\.?c\.?[dđ]|c\.?m\.?t\.?n\.?[dđ]|c\.?m\.?n\.?[dđ]|cmt|can cuoc|chung minh|[dđ]inh [dđ]anh|[dđ][dđ]cn|so the|ho chieu|passport|\yid\y).{0,80}(?<![0-9])(?<![0-9]\.)[0-9](?:(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]){8,11}(?![0-9])(?!\.[0-9])'
    or plain ~* '(?<![0-9])(?<![0-9]\.)(?<!\+)(?<!\+[[:blank:]])(?<!\+84[[:blank:]]{0,3})(?<![^[:alpha:]](?:mst|ma so thue|so thue|tax code|tax id|stk|so tai khoan|tai khoan|account|account no\.?|account number|sdt|[dđ]t|[dđ]ien thoai|tel|hotline|phone)[^[:alpha:][:digit:]]{0,8})(?!0(?:(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]){9}(?!(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]))[0-9](?:(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]){8,11}(?![0-9])(?!\.[0-9]).{0,40}(c\.?c\.?c\.?[dđ]|c\.?m\.?t\.?n\.?[dđ]|c\.?m\.?n\.?[dđ]|cmt|can cuoc|chung minh|[dđ]inh [dđ]anh|[dđ][dđ]cn|so the|ho chieu|passport|\yid\y)'
    or plain ~* '(?<![0-9])(?<![0-9]\.)(?<![^[:alpha:]](?:pa|pb|pc|pd|pe))[0-9](?:(?:[ \t\u000B\u000C   ]{1,3}|\r?\n|[ \t\u000B\u000C   ]?[.,_·‐-―|-]{1,2}[ \t\u000B\u000C   ]?)?[0-9]){11}(?![0-9])(?!\.[0-9])'
  ), false)
  from jsonb_path_query(coalesce(p_value, 'null'::jsonb), 'strict $.**') as scalar
  cross join lateral (
    select private.blank_matches_once(
      private.blank_matches_once(
        ' ' || regexp_replace(normalize(scalar #>> '{}', NFKD), '[­​-‏⁠-⁤﻿̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]', '', 'g') || ' ',
        '(?<![0-9])(?:(?:0?[1-9]|[12][0-9]|3[01])([./·-])(?:0?[1-9]|1[0-2])\2(?:19|20)?[0-9]{2}|(?:19|20)[0-9]{2}([./·-])(?:0?[1-9]|1[0-2])\3(?:0?[1-9]|[12][0-9]|3[01])|(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])|(?<![0-9][./·-])(?:0?[1-9]|1[0-2])[./·-](?:19|20)[0-9]{2})(?![0-9])', ''),
      '(?:(?<![0-9.,·])(?:[1-9][0-9]{0,2}(?:(?:[.·][0-9]{3})+|(?:,[0-9]{3})+)|(?<![ \t\u000B\u000C\t\u000B\u000C   ])[1-9][0-9]{0,2})|(?<![0-9])[.,·](?:[1-9][0-9]{0,2}(?:(?:[.·][0-9]{3})+|(?:,[0-9]{3})+)|[1-9][0-9]{0,2})|(?<![0-9 \t\u000B\u000C\t\u000B\u000C   ])[ \t\u000B\u000C\t\u000B\u000C   ]{1,3}[1-9][0-9]{0,2})(?![0-9])(?![.,·][0-9])(?=[[:space:]]?(?:đ|₫|[dđ]ong|vnd|vnđ)(?![[:alnum:]]))', 'i') as plain
    offset 0
  ) as cleaned
  where jsonb_typeof(scalar) in ('string', 'number');
$$;
