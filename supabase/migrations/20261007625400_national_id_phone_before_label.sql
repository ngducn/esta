-- SPEC D11 backstop. A phone or tax code of 10 digits stays whole before a labelled ID: only a group of one or two
-- digits can finish it to 12, so `0901234567, 023456789 (CMND)` keeps the phone and cuts the ID. Same rule as the worker.
create or replace function private.holds_national_id(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_or(
    plain ~* '(c\.?c\.?c\.?[dđ]|c\.?m\.?t\.?n\.?[dđ]|c\.?m\.?n\.?[dđ]|cmt|can cuoc|chung minh|[dđ]inh [dđ]anh|[dđ][dđ]cn|so the|ho chieu|passport|\yid\y).{0,80}(?<![0-9])(?<![0-9]\.)[0-9](?:(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]){8,11}(?![0-9])(?!\.[0-9])'
    or plain ~* '(?<![0-9])(?<![0-9]\.)(?<!\+)(?<!\+[[:blank:]])(?<!\+84[[:blank:]]{0,3})(?<![^[:alpha:]](?:mst|ma so thue|so thue|tax code|tax id|stk|so tai khoan|tai khoan|account|account no\.?|account number|sdt|[dđ]t|[dđ]ien thoai|tel|hotline|phone)[^[:alpha:][:digit:]]{0,8})(?!0(?:(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]){9}(?![0-9]|(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)[0-9]{1,2}(?![0-9])))[0-9](?:(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]){8,11}(?![0-9])(?!\.[0-9]).{0,40}(c\.?c\.?c\.?[dđ]|c\.?m\.?t\.?n\.?[dđ]|c\.?m\.?n\.?[dđ]|cmt|can cuoc|chung minh|[dđ]inh [dđ]anh|[dđ][dđ]cn|so the|ho chieu|passport|\yid\y)'
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
