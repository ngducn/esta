-- SPEC D11 backstop, kept at least as strict as reduceNationalIds (packages/core/src/agent-schemas/reduce-national-ids.ts).
-- The judge now reads the text the way the reducer does: compatibility-decomposed with accents and invisible characters
-- dropped (đ stays), so a label without accents, with an accent on a letter, or written CMNĐ still counts, and a run
-- of "…" or "№" is measured at the length it has after decomposition. A label reaches 80 characters ahead of a
-- 9- to 11-digit number or 40 characters behind it. Spaced dashes and bars join digit groups. A month and year is a
-- date, ₫ is a currency mark, and a number that continues digits after spaces is not an amount, so
-- `079 175 001 234 đồng` is still an ID.
create or replace function private.holds_national_id(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_or(
    plain ~* '(c\.?c\.?c\.?[dđ]|c\.?m\.?t\.?n\.?[dđ]|c\.?m\.?n\.?[dđ]|cmt|can cuoc|chung minh|[dđ]inh [dđ]anh|[dđ][dđ]cn|so the|ho chieu|passport|\yid\y).{0,80}(?<![0-9])(?<![0-9]\.)[0-9](?:(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]){8,11}(?![0-9])(?!\.[0-9])'
    or plain ~* '(?<![0-9])(?<![0-9]\.)[0-9](?:(?:[[:space:]]{1,3}|[[:space:]]?[./,_·‐-―|-]{1,2}[[:space:]]?)?[0-9]){8,11}(?![0-9])(?!\.[0-9]).{0,40}(c\.?c\.?c\.?[dđ]|c\.?m\.?t\.?n\.?[dđ]|c\.?m\.?n\.?[dđ]|cmt|can cuoc|chung minh|[dđ]inh [dđ]anh|[dđ][dđ]cn|so the|ho chieu|passport|\yid\y)'
    or plain ~* '(?<![0-9])(?<![0-9]\.)(?<![^[:alpha:]](?:pa|pb|pc|pd|pe))[0-9](?:(?:[ \t\u000B\u000C   ]{1,3}|\r?\n|[ \t\u000B\u000C   ]?[.,_·‐-―|-]{1,2}[ \t\u000B\u000C   ]?)?[0-9]){11}(?![0-9])(?!\.[0-9])'
  ), false)
  from jsonb_path_query(coalesce(p_value, 'null'::jsonb), 'strict $.**') as scalar
  cross join lateral (
    select private.blank_matches(
      private.blank_matches(
        ' ' || regexp_replace(normalize(scalar #>> '{}', NFKD), '[­​-‏⁠-⁤﻿̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]', '', 'g') || ' ',
        '(?<![0-9])(?:(?:0?[1-9]|[12][0-9]|3[01])([./-])(?:0?[1-9]|1[0-2])\1(?:19|20)?[0-9]{2}|(?:19|20)[0-9]{2}([./-])(?:0?[1-9]|1[0-2])\2(?:0?[1-9]|[12][0-9]|3[01])|(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])|(?<![0-9][./-])(?:0?[1-9]|1[0-2])[./-](?:19|20)[0-9]{2})(?![0-9])', ''),
      '(?<![0-9])(?<![0-9][.,])(?<![0-9][ \t\u000B\u000C   ]{1,3})[1-9][0-9]{0,2}(?:(?:\.[0-9]{3})+|(?:,[0-9]{3})+)?(?![0-9])(?![.,][0-9])(?=[[:space:]]?(?:đ|₫|[dđ]ong|vnd|vnđ)(?![[:alnum:]]))', 'i') as plain
  ) as cleaned
  where jsonb_typeof(scalar) in ('string', 'number');
$$;
