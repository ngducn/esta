import { MONTHS_EN } from '../format';
import { FOLDED_VND_MAGNITUDES } from '../parse/vnd-input';
import { foldVietnamese } from '../search/fold';

export type Meaning =
  | { readonly kind: 'magnitude'; readonly factor: bigint }
  | { readonly kind: 'currency'; readonly strong: boolean }
  | { readonly kind: 'ratio'; readonly bp: bigint }
  | { readonly kind: 'measure' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'half' }
  | { readonly kind: 'digitWord' }
  | { readonly kind: 'connective' }
  | { readonly kind: 'label' }
  | { readonly kind: 'dateCue' }
  | { readonly kind: 'dateUnit'; readonly unit: 'day' | 'month' | 'year' }
  | { readonly kind: 'month'; readonly month: number };

type Kind = Meaning['kind'];

const rows = (meaning: Meaning, spellings: string) => spellings.split('|').map((spelling) => [spelling, meaning] as const);

const WORDS: readonly (readonly [string, Meaning])[] = [
  ...[...FOLDED_VND_MAGNITUDES].map(([spelling, factor]) => [spelling, { kind: 'magnitude', factor }] as const),
  ...rows({ kind: 'magnitude', factor: 1_000_000_000n }, 'tỷ|tỉ|B'),
  ...rows({ kind: 'magnitude', factor: 1_000_000n }, 'triệu|M'),
  ...rows({ kind: 'magnitude', factor: 1_000n }, 'nghìn|ngàn'),
  ...rows({ kind: 'magnitude', factor: 100n }, 'trăm'),
  ...rows({ kind: 'currency', strong: true }, '₫|đ|vnd|vnđ'),
  ...rows({ kind: 'currency', strong: false }, 'đồng'),
  ...rows({ kind: 'ratio', bp: 100n }, '%|percent|pct|phần trăm|per cent'),
  ...rows({ kind: 'ratio', bp: 1n }, 'bp|bps'),
  ...rows({ kind: 'measure' }, 'm²|m³|km²|m2|m3|km2|ha'),
  ...rows({ kind: 'unreadable' }, 'm|d|mấy|chục|mươi|linh|lẻ|vạn|củ|lít|tỏi|bil|xị|cành|lốp|cây|chỉ|lượng|$|usd|đô|eur|€'),
  ...rows({ kind: 'half' }, 'rưỡi|rưởi'),
  ...rows({ kind: 'digitWord' }, 'một|mốt|hai|ba|bốn|tư|năm|lăm|nhăm|sáu|bảy|bẩy|tám|chín|mười'),
  ...rows({ kind: 'connective' }, '-|–|—|~|đến|tới|to|and|và|hoặc|hay|or'),
  ...rows({ kind: 'label' }, 'phòng|tầng|lầu|căn|lô|thửa|tờ|số|nhà|kho|ki-ốt|quận|phường|khu|dãy|block|demo|thứ|room|rooms|unit|floor|lot|no'),
  ...rows({ kind: 'dateCue' }, 'đến|tới|to|từ|hạn|nay|hôm|kể|thúc|vào|lúc|trước|sau|mùng|mồng|on|from|until|since|by|due|before|after'),
  ...rows({ kind: 'dateUnit', unit: 'day' }, 'ngày'),
  ...rows({ kind: 'dateUnit', unit: 'month' }, 'tháng'),
  ...rows({ kind: 'dateUnit', unit: 'year' }, 'năm'),
  ...MONTHS_EN.flatMap((name, index) => rows({ kind: 'month', month: index + 1 }, `${name}|${name.slice(0, 3)}`)),
];

const FOLDS: ReadonlySet<Kind> = new Set(['magnitude', 'currency', 'ratio', 'measure', 'unreadable', 'half']);
const AMOUNT: ReadonlySet<Kind> = new Set(['magnitude', 'currency', 'ratio', 'unreadable', 'half']);

function index(entries: readonly (readonly [string, Meaning])[]): ReadonlyMap<string, readonly Meaning[]> {
  const map = new Map<string, Meaning[]>();
  for (const [spelling, meaning] of entries) map.set(spelling, [...(map.get(spelling) ?? []), meaning]);
  return map;
}

const CASED = index(WORDS.filter(([spelling]) => spelling !== spelling.toLowerCase()));
const EXACT = index(WORDS.filter(([spelling]) => spelling === spelling.toLowerCase()));
const FOLDED = index(WORDS.filter(([, meaning]) => FOLDS.has(meaning.kind)).map(([spelling, meaning]) => [foldVietnamese(spelling), meaning]));
const NONE: readonly Meaning[] = [];

export function meaningsOf(word: string): readonly Meaning[] {
  const lower = word.toLowerCase();
  const folded = foldVietnamese(word) === lower ? FOLDED.get(lower) : undefined;
  return CASED.get(word) ?? EXACT.get(lower) ?? folded ?? NONE;
}

const GLUED_MAGNITUDES = WORDS.flatMap(([spelling, meaning]) =>
  meaning.kind === 'magnitude' ? [{ spelling, factor: meaning.factor, cased: CASED.has(spelling) }] : [],
).toSorted((a, b) => b.spelling.length - a.spelling.length);

export function magnitudeWithCurrency(word: string): bigint | null {
  const lower = word.toLowerCase();
  const magnitude = GLUED_MAGNITUDES.find(({ spelling, cased }) => (cased ? word : lower).startsWith(spelling));
  const rest = magnitude === undefined ? [] : meaningsOf(word.slice(magnitude.spelling.length));
  return magnitude !== undefined && rest.some((meaning) => meaning.kind === 'currency') ? magnitude.factor : null;
}

export const PER = /\/(?:\p{L}+|m²|m2)$/u;

function wordMeanings(word: string): readonly Meaning[] {
  const meanings = meaningsOf(word);
  const glued = meanings.length === 0 ? magnitudeWithCurrency(word) : null;
  return glued === null ? meanings : [{ kind: 'magnitude', factor: glued }];
}

function disguisedAmountWord(body: string): boolean {
  const stripped = body.replace(/[^\p{L}\p{N}%₫²³]/gu, '');
  return stripped !== body && wordMeanings(stripped).some((meaning) => AMOUNT.has(meaning.kind));
}

function classify(body: string): readonly Meaning[] {
  const word = body.replace(PER, '');
  const meanings = wordMeanings(word === '' ? body : word);
  if (meanings.length > 0) return meanings;
  return disguisedAmountWord(body) ? [{ kind: 'unreadable' }] : NONE;
}

export type Token = {
  readonly start: number;
  readonly end: number;
  readonly body: string;
  readonly core: string;
  readonly sign: '' | '-';
  readonly openedBefore: boolean;
  readonly closedAfter: boolean;
  readonly listComma: boolean;
  readonly digits: boolean;
  readonly hasDigit: boolean;
  readonly symbolOnly: boolean;
  readonly meanings: readonly Meaning[];
};

const LEAD = /^[([{"“‘'«~≈]+/u;
const TRAIL = /[)\]}"”’'».,;:!?…]+$/u;
const CLOSE = /[)\]}"”’'»]/u;
const ENDS = /[.,;:!?…]/u;

function token(raw: string, at: number): Token & { readonly trail: string } {
  const lead = LEAD.exec(raw)?.[0].length ?? 0;
  const trail = TRAIL.exec(raw.slice(lead))?.[0] ?? '';
  const stripped = raw.slice(lead, raw.length - trail.length);
  const body = stripped === '' ? raw : stripped;
  const signed = /^[-−+]\d/u.test(body);
  const core = signed ? body.slice(1) : body;
  const meanings = /^\d/u.test(core) ? NONE : classify(body);
  return {
    start: at + (stripped === '' ? 0 : lead),
    end: at + (stripped === '' ? raw.length : raw.length - trail.length),
    body,
    core,
    sign: signed && body[0] !== '+' ? '-' : '',
    openedBefore: lead > 0 && stripped !== '',
    closedAfter: CLOSE.test(trail),
    listComma: false,
    digits: /^\d/u.test(core),
    hasDigit: /\p{N}/u.test(body.replace(PER, '')) && !meanings.some((meaning) => meaning.kind === 'measure'),
    symbolOnly: meanings.length === 0 && !/[\p{L}\p{N}]/u.test(body),
    meanings,
    trail,
  };
}

export function clauses(text: string): Token[][] {
  const tokens = [...text.matchAll(/\S+/gu)].map((match) => token(match[0], match.index));
  const result: Token[][] = [];
  let clause: Token[] = [];
  tokens.forEach(({ trail, ...current }, at) => {
    const next = tokens[at + 1];
    const listComma = trail === ',' && next !== undefined && next.digits && !next.openedBefore;
    clause.push({ ...current, listComma });
    if (ENDS.test(trail) && !listComma) {
      result.push(clause);
      clause = [];
    }
  });
  if (clause.length > 0) result.push(clause);
  return result;
}

export function nextJoins(tokens: readonly Token[], at: number): boolean {
  const current = tokens[at];
  const next = tokens[at + 1];
  return current !== undefined && next !== undefined && !current.closedAfter && !current.listComma && !next.openedBefore;
}

export function meaningOf<K extends Kind>(token: Token | undefined, kind: K): Extract<Meaning, { kind: K }> | undefined {
  return token?.meanings.find((meaning): meaning is Extract<Meaning, { kind: K }> => meaning.kind === kind);
}

export const has = (token: Token | undefined, kind: Kind) => meaningOf(token, kind) !== undefined;
