import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NATIONAL_ID_REPLAYED, NATIONAL_ID_VECTORS } from '../packages/core/src/agent-schemas/national-id-vectors.ts';
import { reduceNationalIds } from '../packages/core/src/agent-schemas/reduce-national-ids.ts';

export const nationalIdTestPath = fileURLToPath(new URL('../supabase/tests/national_id.test.sql', import.meta.url));

/** A Unicode-escaped SQL literal, so an invisible separator or a full-width digit stays visible in the file. */
function literal(text: string): string {
  const body = [...text]
    .map((char) => {
      if (char === "'") return "''";
      if (char === '\\') return '\\\\';
      if (/[\x20-\x7E\p{L}]/u.test(char)) return char;
      const hex = (char.codePointAt(0) ?? 0).toString(16).toUpperCase();
      return hex.length <= 4 ? `\\${hex.padStart(4, '0')}` : `\\+${hex.padStart(6, '0')}`;
    })
    .join('');
  return `U&'${body}'`;
}

const description = (text: string) => `'${text.replaceAll("'", "''")}'`;
export const holds = (text: string) => `private.holds_national_id(to_jsonb(${literal(text)}::text))`;

/** Numbers as `accepted_fields` holds an area or a year, and whether the CHECK refuses each. */
const NUMBERS: readonly (readonly [value: string, held: boolean])[] = [
  ['123456789012', true],
  ['99999999.99', false],
  ['2043', false],
];

/** Every vector's text, then the numbers, as one jsonb array, and the positions the review save's judge must name. */
function judged(): { array: string; refused: number[] } {
  const { squeezed, refused } = NATIONAL_ID_VECTORS;
  const { reduced, kept } = NATIONAL_ID_REPLAYED;
  const texts: (readonly [text: string, held: boolean])[] = [
    ...reduced.flatMap(([, text, output]) => [[text, true] as const, [output, false] as const]),
    ...kept.map(([, text]) => [text, false] as const),
    ...squeezed.flatMap(([, text, stored]) => [[text, false] as const, [stored, false] as const]),
    ...refused.map(([, text]) => [text, true] as const),
  ];
  // to_jsonb of a text array, as jsonb_build_array takes at most 100 arguments.
  const array = `to_jsonb(array[${texts.map(([text]) => literal(text)).join(', ')}]::text[]) || jsonb_build_array(${NUMBERS.map(([value]) => value).join(', ')})`;
  return { array, refused: [...texts, ...NUMBERS].flatMap(([, held], index) => (held ? [index] : [])) };
}

const leaf = (value: unknown) => ({ value, confidence: 0.9, page: 1 });
const reducerCuts = (text: string) => reduceNationalIds({ notes_text: leaf(text) }).notes_text.value !== text;

/** A set of BMP code points as an int4multirange literal. */
function multirange(codes: readonly number[]): string {
  const ranges: [number, number][] = [];
  for (const code of codes) {
    const last = ranges.at(-1);
    if (last !== undefined && last[1] === code - 1) last[1] = code;
    else ranges.push([code, code]);
  }
  return `'{${ranges.map(([from, to]) => `[${from},${to}]`).join(',')}}'::int4multirange`;
}

/** What each sweep puts a character `c` in, for the reducer and as a SQL expression over `cp`, the character's code point. */
const SWEEPS: readonly (readonly [name: string, text: (c: string) => string, sql: string])[] = [
  ['joins the groups of an unlabelled number', (c) => `Số 079${c}123${c}456${c}789`, `${literal('Số 079')} || chr(cp) || '123' || chr(cp) || '456' || chr(cp) || '789'`],
  ['joins the groups of a labelled number', (c) => `cccd 079${c}123${c}456${c}789`, `'cccd 079' || chr(cp) || '123' || chr(cp) || '456' || chr(cp) || '789'`],
  ['is a digit of an unlabelled number', (c) => `Số ${c.repeat(12)}`, `${literal('Số ')} || repeat(chr(cp), 12)`],
];

/** One assertion per sweep: over every BMP character, the database refuses exactly what the reducer cuts. */
function sweepLines(): string[] {
  const stable: number[] = [];
  for (let code = 1; code <= 0xffff; code++) {
    const char = String.fromCharCode(code);
    if ((code < 0xd800 || code > 0xdfff) && char.normalize('NFKD') === char) stable.push(code);
  }
  const bmp = SWEEPS.map(([name, text, sql]) => {
    const cut = stable.filter((code) => reducerCuts(text(String.fromCharCode(code))));
    return `select is((select count(*) from generate_series(1, 65535) cp where ${multirange(stable)} @> cp and normalize(chr(cp), NFKD) = chr(cp) and private.holds_national_id(to_jsonb(${sql})) is distinct from (${multirange(cut)} @> cp)), 0::bigint, ${description(`the database and the reducer agree on every character that ${name}`)});`;
  });
  // Beyond the BMP: every format character and decimal digit (the classes the folds treat on their own) and one code point in 997 of the rest.
  const beyond: number[] = [];
  for (let code = 0x10000; code <= 0x10ffff; code++) if (/^[\p{Cf}\p{Nd}]$/u.test(String.fromCodePoint(code)) || (code % 997 === 0 && String.fromCodePoint(code).normalize('NFKD') === String.fromCodePoint(code))) beyond.push(code);
  const plane = SWEEPS.map(([name, text, sql]) => {
    const cut = beyond.filter((code) => reducerCuts(text(String.fromCodePoint(code))));
    return `select is((select count(*) from unnest(array[${beyond.join(',')}]) cp where private.holds_national_id(to_jsonb(${sql})) is distinct from (cp = any(array[${cut.join(',')}]::integer[]))), 0::bigint, ${description(`the database and the reducer agree on every digit, format character and sampled character above the BMP that ${name}`)});`;
  });
  return [...bmp, ...plane];
}

/** A fixed pseudo-random stream, so the generated file is the same on every run. */
function stream(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Slashes of other widths, format characters, a Hangul filler, and a line break with spaces: what the database folds before it looks. */
const FUZZ_JOINERS = ['', ' ', '  ', '.', ',', '-', '\u2013', '/', '\n', '\u00B7', '_', ' - ', '( ', '|', '\u066B', '\u00A0', '\u2215', '\u2044', '\u29F8', '\uFF0F', ' \n', '\n ', '\u200B', '\u202E', '\u061C', '\u180E', '\u2067', '\uFFF9', '\u3164', '\u00B7 ', ', ', '. '];
const FUZZ_LABELS = ['', 'cccd ', 'CMND: ', 'Giá ', 'SĐT ', 'MST ', 'Số ', 'ID ', 'passport ', 'Chứng minh nhân dân '];
const FUZZ_HEADS = ['', 'VND ', '\u20AB ', '\u20AB', 'vnđ ', 'đ ', '+84 ', '0', 'PE', 'x', 'STK '];
const FUZZ_TAILS = ['', ' đ', ' đồng', ' VND', ' \u20AB', ' tỷ', ' triệu', ' 12/03/2021', ' cấp', '.5', ' 25', '\n12', ' CCCD', ' Đồng Nai', ' đồng ý', ' Triệu Thị', ' ĐỒNG', ' Tý', ' vnd', ' Đ', 'đ5'];
/** The zero of the script each digit is written in: ASCII mostly, then Arabic-Indic, Devanagari, Thai, full-width and Adlam. */
const FUZZ_ZEROS = [0x30, 0x30, 0x30, 0x660, 0x6f0, 0x966, 0xe50, 0xff10, 0x1e950];

const FUZZ_COUNT = 1500;

/** Random runs of 8 to 13 digits with a label, a currency marker, a phone prefix or a date around them; the reducer is the judge of each. */
function fuzzTexts(count: number): string[] {
  const next = stream(20261007);
  const pick = (items: readonly string[]) => items[Math.floor(next() * items.length)] ?? '';
  return Array.from({ length: count }, () => {
    const length = 8 + Math.floor(next() * 6);
    const zero = FUZZ_ZEROS[Math.floor(next() * FUZZ_ZEROS.length)] ?? 0x30;
    const digits = Array.from({ length }, (_, at) => `${String.fromCodePoint((next() < 0.8 ? zero : (FUZZ_ZEROS[Math.floor(next() * FUZZ_ZEROS.length)] ?? 0x30)) + Math.floor(next() * 10))}${at < length - 1 ? (next() < 0.55 ? pick(['', '', ' ']) : pick(FUZZ_JOINERS)) : ''}`);
    return `${pick(FUZZ_LABELS)}${pick(FUZZ_HEADS)}${digits.join('')}${pick(FUZZ_TAILS)}`;
  });
}

function fuzzLine(): string {
  const texts = fuzzTexts(FUZZ_COUNT);
  const expected = texts.map(reducerCuts);
  return `select is(array(select private.holds_national_id(to_jsonb(t)) from unnest(array[${texts.map(literal).join(', ')}]::text[]) with ordinality as x(t, n) order by n), array[${expected.join(', ')}], ${description(`the database refuses exactly the ${FUZZ_COUNT} generated texts that the reducer cuts`)});`;
}

export function renderNationalIdTest(): string {
  const { squeezed, refused } = NATIONAL_ID_VECTORS;
  const { reduced, kept } = NATIONAL_ID_REPLAYED;
  const { array, refused: positions } = judged();
  const lines = [
    ...reduced.flatMap(([name, text, output]) => [
      `select ok(${holds(text)}, ${description(`refuses ${name}`)});`,
      `select ok(not ${holds(output)}, ${description(`accepts ${name} once reduced`)});`,
    ]),
    ...kept.map(([name, text]) => `select ok(not ${holds(text)}, ${description(`accepts ${name}`)});`),
    ...squeezed.flatMap(([name, text, stored]) => [
      `select ok(not ${holds(text)}, ${description(`accepts ${name} as read`)});`,
      `select ok(not ${holds(stored)}, ${description(`accepts ${name} as acceptance stores it`)});`,
    ]),
    ...refused.map(([name, text]) => `select ok(${holds(text)}, ${description(`refuses ${name}, which the reducer leaves`)});`),
    ...sweepLines(),
    fuzzLine(),
  ];
  // Last and as a member, through the public judge only: a member calling a private function directly crashes local Postgres (#128).
  const judge = `select is(public.national_id_indexes(${array}), array[${positions.join(', ')}]::integer[], 'a member asking the review save judge gets the position of every value the CHECK refuses');`;
  return [
    '-- Generated by scripts/national-id-vectors.ts from packages/core/src/agent-schemas/national-id-vectors.ts.',
    '-- Run `pnpm exec tsx scripts/national-id-vectors.ts` after changing the vectors. The reducer test runs the same vectors.',
    'begin;',
    '\\ir _harness.psql',
    '',
    `select plan(${lines.length + 1});`,
    '',
    ...lines,
    '',
    "select tests.create_household('a') as a \\gset",
    "select tests.act_as('member.a@test.esta.test');",
    judge,
    '',
    'select * from finish();',
    'rollback;',
    '',
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(nationalIdTestPath, renderNationalIdTest());
  console.log(`wrote ${nationalIdTestPath}`);
}
