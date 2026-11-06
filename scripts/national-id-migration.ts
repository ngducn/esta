import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CARET_CLASS, TILDE_CLASS } from './national-id-classes.ts';

export const nationalIdMigrationPath = fileURLToPath(new URL('../supabase/migrations/20261007643000_national_id_follows_core.sql', import.meta.url));

const hex = (cp: number, w: number) => cp.toString(16).toUpperCase().padStart(w, '0');
const esc = (cp: number) => (cp <= 0xffff ? '\\u' + hex(cp, 4) : '\\U' + hex(cp, 8));
function ranges(cps: readonly number[]): string {
  const out: [number, number][] = [];
  for (const cp of cps) {
    const last = out[out.length - 1];
    if (last !== undefined && last[1] === cp - 1) last[1] = cp;
    else out.push([cp, cp]);
  }
  return out.map(([a, b]) => (a === b ? esc(a) : b === a + 1 ? esc(a) + esc(b) : esc(a) + '-' + esc(b))).join('');
}
const all: number[] = [];
for (let cp = 0; cp <= 0x10ffff; cp++) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  all.push(cp);
}
const test = (re: RegExp) => all.filter((cp) => re.test(String.fromCodePoint(cp)));
const CF = test(/^\p{Cf}$/u);
const ND = test(/^\p{Nd}$/u);
const asciiOf = (s: string) => s.normalize('NFKD');
const digitValue = (cp: number) => { let v = 0; while (/^\p{Nd}$/u.test(String.fromCodePoint(cp - 1 - v))) v++; return v % 10; };
// Nd characters NFKD leaves alone
const NDKEEP = ND.filter((cp) => cp > 0x7f && asciiOf(String.fromCodePoint(cp)) === String.fromCodePoint(cp));
const NDBMP = NDKEEP.filter((cp) => cp <= 0xffff);
const NDSUPP = ND.filter((cp) => cp > 0xffff); // all of them: Postgres's NFKD may predate a digit that Node's maps
const u = (cps: readonly number[]) => cps.map((cp) => (cp <= 0xffff ? '\\' + hex(cp, 4) : '\\+' + hex(cp, 6))).join('');
const translateBmpTo = NDBMP.map((cp) => (digitValue(cp) === 0 ? '\\E010' : String(digitValue(cp)))).join('');
const translateSuppTo = NDSUPP.map((cp) => String(digitValue(cp))).join('');
const CLASS_A = `[${ranges(CF)}\\u115F\\u1160\\u3164\\uFFA0\\u0300-\\u036F\\u1AB0-\\u1AFF\\u1DC0-\\u1DFF\\u20D0-\\u20FF\\uFE20-\\uFE2F]`;
const ND_OTHER = ranges(NDBMP);   // other-script digits left after NFKD and the supplementary translate
const ND_ANY = '0-9' + ranges(NDBMP) + ranges(NDSUPP);

const WSL = String.raw`[ \t\u000B\u000C\u1680\u2028\u2029]`;
const WSN = String.raw`[ \t\n\r\u000B\u000C\u1680\u2028\u2029]`;
const D = String.raw`[0-9\uE010]`;
const NOTD = String.raw`(?<![0-9\uE010])`;
const LABEL = String.raw`(?:c\.?c\.?c\.?[dđ]|c\.?m\.?t\.?n\.?[dđ]|c\.?m\.?n\.?[dđ]|cmt|can cuoc|chung minh|[dđ]inh [dđ]anh|[dđ][dđ]cn|so the|ho chieu|passport|\yid\y)`;
const SEPL = String.raw`(?:${WSN}{1,3}|${WSN}?[~^/.,·+_\uE001\uE004-]{1,4}${WSN}?)`;
const SEPU = String.raw`(?:${WSL}{1,3}|${WSL}{0,3}\r?\n${WSL}{0,3}|${WSL}?[~.,·+_\uE001\uE004-]{1,4}${WSL}?)`;
const run = (sep: string, n: number | string) => String.raw`${D}(?:(?:${sep})?${D}){${n}}`;
const idLabelled = String.raw`(?:${NOTD}${D}{12}|${NOTD}(?<!${D}\.)(?:${run(SEPL, 11)}|${run(SEPL, '8,10')}(?!\.${D})))(?!${D})`;
const phone = String.raw`(?!0(?:(?:${SEPL})?${D}){9}(?!${D}|${SEPL}${D}{1,2}(?!${D})))`;
const otherNumber = String.raw`(?<!\+)(?<!\+${WSL})(?<!\+84${WSL}{0,3})(?<![^[:alpha:]](?:mst|ma so thue|so thue|tax code|tax id|stk|so tai khoan|tai khoan|account|account no\.?|account number|sdt|[dđ]t|[dđ]ien thoai|tel|hotline|phone)[^[:alpha:][:digit:]\uE002\uE003\uE005\uE006\uE010]{0,8})`;
const P1 = String.raw`${LABEL}.{0,80}${idLabelled}`;
const P2 = String.raw`${NOTD}${otherNumber}${phone}(?:${NOTD}${D}{12}|${NOTD}(?<!${D}\.)(?:${run(SEPL, 11)}|${run(SEPL, '8,10')}(?!\.${D})))(?!${D}).{0,40}${LABEL}`;
const P3 = String.raw`${NOTD}(?<![^[:alpha:]](?:pa|pb|pc|pd|pe))(?:${D}{12}|(?<!${D}\.)${run(SEPU, 11)})(?!${D})`;

const DATE = String.raw`(?<![0-9${ND_OTHER}])(?:(?:0?[1-9]|[12][0-9]|3[01])([./·-])(?:0?[1-9]|1[0-2])\2(?:19|20)?[0-9]{2}|(?:19|20)[0-9]{2}([./·-])(?:0?[1-9]|1[0-2])\3(?:0?[1-9]|[12][0-9]|3[01])|(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])|(?<![0-9${ND_OTHER}][./·-])(?:0?[1-9]|1[0-2])[./·-](?:19|20)[0-9]{2})(?![0-9${ND_OTHER}])`;
const AMOUNT = String.raw`(?:(?<![0-9\uE010.,·])(?:[1-9]${D}{0,2}(?:(?:[.·]${D}{3})+|(?:,${D}{3})+)|(?<!${WSL})[1-9]${D}{0,2})|(?<!${D})[.,·](?:[1-9]${D}{0,2}(?:(?:[.·]${D}{3})+|(?:,${D}{3})+)|[1-9]${D}{0,2})|(?<![0-9\uE010 \t\u000B\u000C\u1680\u2028\u2029])${WSL}{1,3}[1-9]${D}{0,2})(?!${D})(?![.,·]${D})(?=${WSN}?[\uE001\uE002\uE005])`;
const tail = String.raw`(?:(?:${WSL}{1,3}|[.,·]${WSL}?)${D}+)*`;
const zeroAlt = String.raw`[0\uE010](?:${WSL}{1,3}${D}+)*[.,·]${WSL}?${D}+${tail}`;
const figPlain = String.raw`(?:[1-9]${D}*${tail}|${zeroAlt})`;
const figLab = String.raw`(?:[1-9]${D}*(?:${WSL}{1,3}${D}+)*[.,·]${WSL}?${D}+${tail}|${zeroAlt})`;
const money = (fig: string) => String.raw`(?:(?<!${D})(?<!${D}${WSL}{1,3})(?<!${D}[.,·]${WSL}?)${fig}(?!${D})(?=${WSL}?[\uE001-\uE003\uE005])|[\uE001\uE004\uE005\uE006]${WSL}?${fig})`;

// A figure of 9 to 12 digits with only separators between it and an ID label is an ID whatever its grouping or currency
// mark (core's `idFigure`): it is never blanked as an amount or a price. The word and letter-sign sentinels and the
// stand-in for another script's zero count as letters and digits here, as they do in core.
const FIGURE_SEP = String.raw`(?:${WSL}{1,3}|[.,·]${WSL}?)`;
const ID_FIGURE = String.raw`(?<=${LABEL}[^[:alpha:][:digit:]\uE002\uE003\uE005\uE006\uE010]*)${D}(?:${FIGURE_SEP}?${D}){8,11}(?!${FIGURE_SEP}?${D})`;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const MARK = (word: string, extra: string, sentinel: string) => `'(?<![[:alpha:]]\\.?)(?:${word})(?![[:alpha:]${extra}])', U&'\\${sentinel}', 'g'`;
const LETTER_SIGNS = 'đ|Đ|vnd|VND|vnđ|VNĐ';

const SQL = `-- SPEC D11 backstop follows core's \`reduceNationalIds\` again (#425, Q-17b). Core reads any punctuation, symbol or mark
-- between digit groups, keeps a figure that a currency word leads or follows whole when it is a true price, cuts a 12-digit
-- run that a dot and a digit precede, and counts digits of every script. SQL read a short list of separators, a narrower
-- amount rule and ASCII digits only, so it refused \`Giá 123 456 789 012 VND\` and accepted \`cccd 079–123–456–789\`.
--
-- The text is read in this order, each step as core reads it: NFC, with every format character (\`Cf\`), the Hangul
-- fillers and combining marks dropped; currency words found as written (đồng, tỷ, triệu, đ, ₫, VND, vnđ in lower case or
-- capitals and standing alone, never after accents fold, so \`Đồng Nai\` and \`Triệu Thị\` are names) and each swapped for a
-- sentinel; NFKD; digits of the planes above the BMP (Adlam and others) as ASCII, like the compatibility digits NFKD
-- already maps; dates blanked on ASCII digits and ASCII separators only; then digits of other scripts become 0-9 (a zero
-- of another script is U+E010, never a phone's 0), a slash of any width becomes \`/\`, a character core takes for a separator
-- between digit groups becomes \`~\` (and \`^\` when only a label makes it one), and amounts and prices become \`x\`. Next to a
-- label only a figure grouped with dots or commas is a price, so the labelled patterns read \`lab\`, and the unlabelled
-- pattern reads \`plain\`. The character classes below are the ranges core joins on, measured from the reducer itself;
-- supabase/tests/national_id.test.sql sweeps characters against core's answer, so a Unicode change in either side fails there.
-- Each lateral step ends in offset 0: without it Postgres pastes the step into every place that reads its column and
-- computes it again each time, which made the check 25 times slower.
create or replace function private.blank_matches_once(p_text text, p_pattern text, p_flags text)
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
  select coalesce(string_agg(piece || coalesce(repeat('x', length(hits[n])), ''), '' order by n), p_text)
  from scanned, unnest(pieces) with ordinality as piece_at(piece, n);
$$;

-- p_text with each character that p_blanked changed from p_base replaced by the blanked one, so the dates, the amounts and the prices that core finds each in
-- the whole text are blanked together (core takes their groups as one set), and none hides another from its pattern.
create or replace function private.overlay_blanks(p_text text, p_base text, p_blanked text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(case when base_char <> blanked_char then blanked_char else text_char end, '' order by at), p_text)
  from unnest(string_to_array(p_text, null), string_to_array(p_base, null), string_to_array(p_blanked, null)) with ordinality as chars(text_char, base_char, blanked_char, at);
$$;

revoke all on function private.overlay_blanks(text, text, text) from public;
grant execute on function private.overlay_blanks(text, text, text) to authenticated, service_role;

create or replace function private.holds_national_id(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_or(
    lab ~* ${q(P1)}
    or lab ~* ${q(P2)}
    or plain ~* ${q(P3)}
  ), false)
  from jsonb_path_query(coalesce(p_value, 'null'::jsonb), 'strict $.**') as scalar
  cross join lateral (
    select regexp_replace(
      normalize(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                translate(regexp_replace(' ' || normalize(scalar #>> '{}', NFC) || ' ', ${q(CLASS_A)}, '', 'g'), U&'\\E001\\E002\\E003\\E004\\E005\\E006\\E010', U&'\\E000\\E000\\E000\\E000\\E000\\E000\\E000'),
                ${MARK('đồng|ĐỒNG', ND_ANY, 'E002')}),
              ${MARK('tỷ|TỶ|triệu|TRIỆU', ND_ANY, 'E003')}),
            ${MARK('₫', ND_ANY, 'E001')}),
          ${MARK('₫', '', 'E004')}),
        ${MARK(LETTER_SIGNS, ND_ANY, 'E005')}),
      ${MARK(LETTER_SIGNS, '', 'E006')}),
        NFKD),
      ${q(CLASS_A)}, '', 'g') as marked
    offset 0
  ) as s1
  cross join lateral (
    select translate(marked, U&'${u(NDSUPP)}', ${q(translateSuppTo)}) as ascii_dated
    offset 0
  ) as s2
  cross join lateral (
    select regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(ascii_dated, U&'${u(NDBMP)}', U&'${translateBmpTo}'),
          '[\\u2044\\u2215\\u29F8\\uFF0F]', '/', 'g'),
        ${q(TILDE_CLASS)}, '~', 'g'),
      ${q(CARET_CLASS)}, '^', 'g') as folded
    offset 0
  ) as s3
  cross join lateral (
    select private.blank_matches_once(folded, ${q(ID_FIGURE)}, 'i') as id_figure
    offset 0
  ) as s4
  cross join lateral (
    select private.overlay_blanks(
             private.overlay_blanks(folded, ascii_dated, private.blank_matches_once(ascii_dated, ${q(DATE)}, '')),
             folded, private.overlay_blanks(private.blank_matches_once(folded, ${q(AMOUNT)}, 'i'), id_figure, folded)) as shared
    offset 0
  ) as s5
  cross join lateral (
    select private.overlay_blanks(shared, folded, private.blank_matches_once(folded, ${q(money(figPlain))}, 'i')) as plain,
           private.overlay_blanks(shared, folded, private.overlay_blanks(private.blank_matches_once(folded, ${q(money(figLab))}, 'i'), id_figure, folded)) as lab
    offset 0
  ) as s6
  where jsonb_typeof(scalar) in ('string', 'number');
$$;
`;
/** Control, line-separator and private-use characters, written as escapes so the file shows what it holds. */
const isEscaped = (code: number) =>
  (code >= 0x01 && code <= 0x08) || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f) || (code >= 0x7f && code <= 0x9f) ||
  code === 0x1680 || code === 0x2028 || code === 0x2029 || (code >= 0xe000 && code <= 0xf8ff);

/** The migration file's text: the SQL, with every character `isEscaped` names written as a \\u escape. */
export function renderNationalIdMigration(): string {
  return [...SQL].map((char) => (isEscaped(char.charCodeAt(0)) ? `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}` : char)).join('');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(nationalIdMigrationPath, renderNationalIdMigration());
  console.log(`wrote ${nationalIdMigrationPath}`);
}
