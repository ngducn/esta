/** A key that holds an ID number by name, such as `id_last4`, `id_number` or `cccd`. */
const ID_KEY = /(?:^|_)(?:id|cccd|cmnd|cmtnd|idno|identity)(?:_|$)/i;

/**
 * Words that announce an ID number, matched with accents dropped, so `CḾND`, OCR's `CMNĐ` and `Chung minh` count. A
 * 9- to 11-digit run counts as an ID when it starts within `LABEL_REACH` characters after one, whatever stands
 * between, so a phone number or a price that close is cut too.
 */
const ID_LABEL = /cccd|cmtnd|cmnd|cmt|can cuoc|chung minh|dinh danh|ddcn|so the|\bid\b/giu;
const LABEL_REACH = 40;
const LABELLED_LENGTHS = [12, 11, 10, 9] as const;

/**
 * Letters that start a utility customer code, as `PE` starts the electricity code `PE012345678901`; they are the five
 * EVN power corporations' prefixes [app rule]. An unlabelled 12-digit run glued to other letters is still an ID.
 */
const CODE_PREFIXES: ReadonlySet<string> = new Set(['PA', 'PB', 'PC', 'PD', 'PE']);

/**
 * Dropped before either judge looks: invisible characters OCR leaves inside a number (zero-width spaces and joiners,
 * direction marks, the soft hyphen, the BOM), and combining marks, which `esta_unaccent` strips from the text the
 * search index holds, so a mark between two digit groups cannot hide an ID the index would hold whole.
 * `holds_national_id` drops the same ranges.
 */
const MARKS = /[\u0300-\u036F]|[\u1AB0-\u1AFF]|[\u1DC0-\u1DFF]|[\u20D0-\u20FF]|[\uFE20-\uFE2F]/gu;
const FOLDED = new RegExp(`[\\u00AD\\u200B-\\u200F\\u2060-\\u2064\\uFEFF]|${MARKS.source}`, 'gu');

/**
 * Each letter without its marks, and đ as d, one code unit for one so a label's position is its position in the text.
 * A letter whose base differs in length, such as a Hangul syllable, stays as it is. `holds_national_id` folds the same way.
 */
const unaccented = (text: string) =>
  text.replace(/[^\0-\x7F]/gu, (char) => {
    if (char === 'đ') return 'd';
    if (char === 'Đ') return 'D';
    const base = char.normalize('NFD').replace(MARKS, '');
    return base.length === char.length ? base : char;
  });

/** A middle dot is read as a dot, so it groups an amount or a date as a dot does and joins ID groups as a dot does. */
const asDots = (text: string) => text.replaceAll('\u00B7', '.');

/** Between two digit groups of one number: up to three spaces of any kind on one line, one newline, or one dot, dash, comma or underscore. */
const JOIN = /^(?:[^\S\n\r]{1,3}|\r?\n|[.,_\-\u2010-\u2015])$/u;
/** After a label the number may also break across lines or use slashes. */
const JOIN_AFTER_LABEL = /^(?:\s{1,3}|[./,_\-\u2010-\u2015])$/u;
/**
 * A date such as 12/03/2021, 12/03/21, 2021-03-12 or 20210312. It never belongs to an ID, so the last four digits of a
 * reduced ID never join one.
 */
export const DATE =
  /(?<!\p{Nd})(?:(?:0?[1-9]|[12]\d|3[01])([./-])(?:0?[1-9]|1[0-2])\1(?:19|20)?\d{2}|(?:19|20)\d{2}([./-])(?:0?[1-9]|1[0-2])\2(?:0?[1-9]|[12]\d|3[01])|(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))(?!\p{Nd})/gu;
/** A Vietnamese amount groups thousands with dots or commas, never starts with 0 (every CCCD does) and names its currency. */
const AMOUNT =
  /(?<!\p{Nd}|\p{Nd}[.,])(?![0０])\p{Nd}{1,3}(?:(?:\.\p{Nd}{3})+|(?:,\p{Nd}{3})+)?(?!\p{Nd}|[.,]\p{Nd})(?=\s?(?:đ|đồng|vnd|vnđ)(?![\p{L}\p{N}]))/giu;
const LETTERS_BEFORE = /\p{L}+$/u;

type Group = { readonly start: number; readonly end: number; readonly digits: string; readonly gap: string | null };
type Span = { readonly from: number; readonly to: number; readonly last4: string };

/** Full-width digits become ASCII; NFKC maps them and leaves every other character as NFC has it. */
const asciiDigits = (text: string) => text.replace(/\p{Nd}/gu, (digit) => digit.normalize('NFKC'));

/** The groups that start inside a match of `pattern`, such as the three groups of one date. */
function groupsIn(text: string, groups: readonly Group[], pattern: RegExp): ReadonlySet<Group> {
  const matches = [...text.matchAll(pattern)].map((m) => [m.index, m.index + m[0].length] as const);
  return new Set(groups.filter((group) => matches.some(([from, to]) => group.start >= from && group.start < to)));
}

/**
 * Finds every national ID in one string: 12 digits anywhere, or 9 to 12 digits within reach of an ID label or in an ID
 * field, the digits possibly grouped. A match spans whole digit groups and stops at the first total that reaches the
 * length, and never takes in a date or an amount, so the date, year or amount after a number stays out of it.
 */
function idSpans(original: string, idField: boolean): Span[] {
  const text = asDots(original);
  const labelEnds = [...unaccented(text).matchAll(ID_LABEL)].map((m) => m.index + m[0].length);
  const afterLabel = (at: number) => idField || labelEnds.some((end) => end <= at && at - end <= LABEL_REACH);

  const groups: Group[] = [];
  for (const m of text.matchAll(/\p{Nd}+/gu)) {
    const previous = groups.at(-1);
    const gap = previous === undefined ? null : text.slice(previous.end, m.index);
    groups.push({ start: m.index, end: m.index + m[0].length, digits: asciiDigits(m[0]), gap });
  }
  const dates = groupsIn(text, groups, DATE);
  const amounts = groupsIn(text, groups, AMOUNT);

  const runOf = (from: number, length: number, join: RegExp): Group[] | undefined => {
    const run: Group[] = [];
    let total = 0;
    for (const group of groups.slice(from)) {
      if (run.length > 0 && (group.gap === null || !join.test(group.gap))) return undefined;
      run.push(group);
      total += group.digits.length;
      if (total >= length) return total === length ? run : undefined;
    }
    return undefined;
  };
  const codePrefixed = (first: Group) => CODE_PREFIXES.has(LETTERS_BEFORE.exec(text.slice(0, first.start))?.[0].toUpperCase() ?? '');

  const spans: Span[] = [];
  for (let from = 0; from < groups.length; from++) {
    const first = groups[from];
    if (first === undefined || first.gap === '.') continue;
    const labelled = afterLabel(first.start);
    for (const length of labelled ? LABELLED_LENGTHS : [12]) {
      const run = runOf(from, length, labelled ? JOIN_AFTER_LABEL : JOIN);
      const last = run?.at(-1);
      if (run === undefined || last === undefined) continue;
      if (groups[from + run.length]?.gap === '.' || run.some((group) => dates.has(group) || amounts.has(group))) continue;
      if (!labelled && codePrefixed(first)) continue;
      spans.push({ from: first.start, to: last.end, last4: run.map((group) => group.digits).join('').slice(-4) });
      from += run.length - 1;
      break;
    }
  }
  return spans;
}

type Found = { readonly last4: string };

function cutOnce(text: string, idField: boolean, found: Found[]): string {
  const spans = idSpans(text, idField);
  const [firstSpan] = spans;
  if (firstSpan === undefined) return text;
  found.push(...spans.map(({ last4 }) => ({ last4 })));
  if (idField) return firstSpan.last4;
  let cursor = 0;
  const parts = spans.map(({ from, to, last4 }) => {
    const part = text.slice(cursor, from) + last4;
    cursor = to;
    return part;
  });
  return parts.join('') + text.slice(cursor);
}

/** Cuts until nothing is left to cut: a cut ID ends closer to the label, and its last four can join the next number. */
function reduceText(text: string, idField: boolean, found: Found[]): string {
  const nfc = text.normalize('NFC').replace(FOLDED, '');
  let current = nfc;
  for (let next = cutOnce(current, idField, found); next !== current; next = cutOnce(current, idField, found)) current = next;
  return current === nfc ? text : current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLeaf(value: unknown): value is Record<string, unknown> & { value: unknown } {
  return isRecord(value) && 'value' in value && 'confidence' in value;
}

function reduceNode(node: unknown, key: string, found: Found[]): unknown {
  if (typeof node === 'string') return reduceText(node, ID_KEY.test(key), found);
  if (Array.isArray(node)) return node.map((item) => reduceNode(item, key, found));
  if (!isRecord(node)) return node;

  const inner: Found[] = [];
  const out: Record<string, unknown> = Object.fromEntries(
    Object.entries(node).map(([childKey, child]) => [childKey, reduceNode(child, childKey === 'value' ? key : childKey, inner)]),
  );
  const idLeaf = out.id_last4;
  const firstFound = inner[0];
  if (isLeaf(idLeaf) && idLeaf.value === null && firstFound !== undefined) {
    out.id_last4 = { ...idLeaf, value: firstFound.last4 };
  }
  found.push(...inner);
  return out;
}

/**
 * Keeps only the last four digits of every national ID number in an extraction, whatever the model returned
 * (AGENT.md §5.1 step 5, SPEC D11). Every string is read, labelled or not: a 12-digit run becomes its last four
 * digits, and so does a 9- to 12-digit run within 40 characters after an ID label or in an ID field, glued to letters
 * or not. An unlabelled run after a utility code's prefix, such as `PE012345678901`, a date and an amount in đồng
 * stay. Reducing twice changes nothing more. An empty `id_last4` is filled from the text beside it.
 */
export function reduceNationalIds<T>(result: T): T {
  return reduceNode(result, '', []) as T;
}
