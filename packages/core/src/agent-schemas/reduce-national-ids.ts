/** A key that holds an ID number by name, such as `id_last4`, `id_number` or `cccd`. */
const ID_KEY = /(?:^|_)(?:id|cccd|cmnd|cmtnd|idno|identity)(?:_|$)/i;

/**
 * Words that announce an ID number, read on the folded text (`fold`): accents dropped, so `Chung minh nhan dan` and
 * `CḾND` count, while `đ` stays and is matched as `d` too, so `CMNĐ` counts. A 9- to 11-digit run counts as an ID when it
 * starts within `LABEL_REACH_AFTER` characters after one, whatever stands between, or ends within `LABEL_REACH_BEFORE`
 * characters before one, so a phone number or a price that close is cut too. `holds_national_id` counts the same way.
 */
const ID_LABEL =
  /c\.?c\.?c\.?[dđ]|c\.?m\.?t\.?n\.?[dđ]|c\.?m\.?n\.?[dđ]|cmt|can cuoc|chung minh|[dđ]inh [dđ]anh|[dđ][dđ]cn|so the|ho chieu|passport|\bid\b/giu;
const LABEL_REACH_AFTER = 80;
const LABEL_REACH_BEFORE = 40;
const LABELLED_LENGTHS = [12, 11, 10, 9] as const;

/**
 * Letters that start a utility customer code, as `PE` starts the electricity code `PE012345678901`; they are the five
 * EVN power corporations' prefixes [app rule]. An unlabelled 12-digit run glued to other letters is still an ID.
 */
const CODE_PREFIXES: ReadonlySet<string> = new Set(['PA', 'PB', 'PC', 'PD', 'PE']);

/**
 * Dropped before either judge looks: invisible characters OCR leaves inside a number (every format character, `\p{Cf}`:
 * zero-width spaces and joiners, direction marks and isolates, the soft hyphen, the BOM; and the Hangul fillers, which
 * print as nothing), and combining marks, which `esta_unaccent` strips from the text the search index holds, so a mark
 * between two digit groups cannot hide an ID the index would hold whole. `holds_national_id` drops the same ranges.
 */
const FOLDED = /\p{Cf}|[\u115F\u1160\u3164\uFFA0]|[\u0300-\u036F]|[\u1AB0-\u1AFF]|[\u1DC0-\u1DFF]|[\u20D0-\u20FF]|[\uFE20-\uFE2F]/gu;

/**
 * Between two digit groups of one number, as a class of characters and not a list of the ones seen so far: up to three
 * spaces of any kind on one line, one newline (with up to three spaces on either side), or up to four punctuation marks (dashes, brackets, quotes), symbols, bullets or combining
 * marks of any script (NFKD spells one symbol, such as `⁗`, with up to four), with a space on either side. Unlabelled,
 * a slash of any width is left out, because `123456/789012` is a document number.
 */
const JOIN = /^(?:[^\S\n\r]{1,3}|[^\S\n\r]{0,3}\r?\n[^\S\n\r]{0,3}|[^\S\n\r]?(?:(?![/\u2044\u2215\u29F8\uFF0F])[\p{P}\p{S}\p{M}]){1,4}[^\S\n\r]?)$/u;
/** After a label the number may also break across lines, and any mark that is no letter or digit may join the groups. */
const JOIN_AFTER_LABEL = /^(?:\s{1,3}|\s?[^\p{L}\p{N}\s]{1,4}\s?)$/u;
/**
 * A date such as 12/03/2021, 12/03/21, 2021-03-12 or 20210312. It never belongs to an ID, so the last four digits of a
 * reduced ID never join one.
 */
export const DATE =
  /(?<!\p{Nd})(?:(?:0?[1-9]|[12]\d|3[01])([./\u00B7-])(?:0?[1-9]|1[0-2])\1(?:19|20)?\d{2}|(?:19|20)\d{2}([./\u00B7-])(?:0?[1-9]|1[0-2])\2(?:0?[1-9]|[12]\d|3[01])|(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])|(?<!\p{Nd}[./\u00B7-])(?:0?[1-9]|1[0-2])[./\u00B7-](?:19|20)\d{2})(?!\p{Nd})/gu;
/**
 * A Vietnamese amount groups thousands with dots or commas, never starts with 0 in any script (every CCCD does), names
 * its currency and, when it has no thousands group, does not continue digits before it after spaces, so the last group of
 * `079 175 001 234 đồng` stays an ID group while `1 125.000.000.000 đồng` stays an amount. A middle dot groups thousands too.
 * It is read on `moneyText`, where the currency word is one sentinel per character.
 */
const AMOUNT =
  /(?<!\p{Nd}|\p{Nd}[.,\u00B7])(?:\p{Nd}{1,3}(?:(?:[.\u00B7]\p{Nd}{3})+|(?:,\p{Nd}{3})+)|(?<!\p{Nd}[^\S\n\r]{1,3})\p{Nd}{1,3})(?!\p{Nd}|[.,\u00B7]\p{Nd})(?=\s?[\uE001\uE002])/gu;
/**
 * Currency words, found on the text as written and never after folding, so `đồng ý` and `đồng sở hữu` still read as the
 * word while `Đồng Nai`, `Đông Anh`, `Triệu Thị` and `Tý` are names: `đồng`, `tỷ`, `triệu`, `đ`, `₫`, `VND` and `vnđ`, each in
 * lower case or in capitals and with its accents, standing alone (no letter before or after; a dot after a letter is an
 * abbreviation, as in `C.M.N.Đ`). A sign or a word can follow a figure; only `₫`, `đ`, `VND` and `vnđ` lead one, even with a digit
 * right after them (`₫079.123`).
 */
const MONEY_WORD = /(?<!\p{L}\.?)(?:(?<dong>đồng|ĐỒNG)|(?<big>tỷ|TỶ|triệu|TRIỆU)|(?<sign>đ|Đ|₫|vnd|VND|vnđ|VNĐ))(?!\p{L})/gu;
const SIGN = '\uE001';
const DONG = '\uE002';
const BIG = '\uE003';
const SIGN_LEADS = '\uE004';
/**
 * A figure in any grouping that a currency word follows or leads, with a space between or none, is money: `1.250.000.000 ₫`
 * and `123456789012 tỷ` stay whole. It is not money when its first group is a 0 followed by a digit (`079.123.456.789 ₫`,
 * `0791234567.89 đ`: every CCCD starts that way, in any script), when it starts with a lone 0 and has no dot, comma or
 * middle dot, or when it lies within an ID label's reach and has no dot or comma, so `CMND 271234567 đồng ý` and
 * `ID 12345678901 đồng` are cut. Spaced groups after a label, as in `CCCD 079 175 001 234 ₫`, are cut for the same reason.
 */
const MONEY_FIGURE = String.raw`\p{Nd}+(?:(?:[^\S\n\r]{1,3}|[.,\u00B7][^\S\n\r]?)\p{Nd}+)*`;
const MONEY = new RegExp(
  String.raw`(?<!\p{Nd})${MONEY_FIGURE}(?!\p{Nd})(?=[^\S\n\r]?[\uE001-\uE003]+)|(?<=[\uE001\uE004]+[^\S\n\r]?)${MONEY_FIGURE}`,
  'gu',
);
const GROUPING = /[.,\u00B7]/u;
const DIGIT = /^\p{Nd}$/u;

/** The value of a decimal digit of any script: its distance from the zero its block of ten starts with. */
function digitValue(char: string): number {
  let value = 0;
  for (let code = (char.codePointAt(0) ?? 0) - 1; DIGIT.test(String.fromCodePoint(code)); code--) value++;
  return value % 10;
}
const isZero = (char: string) => DIGIT.test(char) && digitValue(char) === 0;
/**
 * A number that is no ID but stands just before an ID label is left whole: a plus sign or a label for a phone, a tax
 * code or an account right before it, and a 10-digit number that starts with 0 (a phone). These are cut only after a
 * label, where the number's place is the ID's. `holds_national_id` leaves the same numbers.
 */
const OTHER_NUMBER_LABEL = /[^\p{L}](?:mst|ma so thue|so thue|tax code|tax id|stk|so tai khoan|tai khoan|account(?: no\.?| number)?|sdt|[dđ]t|[dđ]ien thoai|tel|hotline|phone)[^\p{L}\p{Nd}]{0,8}$|\+(?:84[^\S\n\r]{0,3}|[^\S\n\r]?)$/iu;
const LETTERS_BEFORE = /\p{L}+$/u;

type Group = { readonly start: number; readonly end: number; readonly digits: string; readonly gap: string | null };
type Span = { readonly from: number; readonly to: number; readonly last4: string };
/** The text as `holds_national_id` reads it, and for each of its characters where the code point it came from starts and ends in the original. */
type Folded = { readonly text: string; readonly from: readonly number[]; readonly to: readonly number[] };

/** Compatibility decomposition, then the invisible characters and combining marks dropped; a character outside the BMP counts as one. */
function fold(text: string): Folded {
  let out = '';
  const from: number[] = [];
  const to: number[] = [];
  let at = 0;
  for (const char of text) {
    const end = at + char.length;
    const folded = char.length === 1 && char < '\u0080' ? char : char.normalize('NFKD').replace(FOLDED, '');
    for (const piece of folded) {
      out += piece.length > 1 ? (DIGIT.test(piece) ? String(digitValue(piece)) : '\uE000') : piece;
      from.push(at);
      to.push(end);
    }
    at = end;
  }
  return { text: out, from, to };
}

/**
 * The text the money patterns read: `folded.text` with each currency word (`MONEY_WORD`, found on the text as written) swapped
 * for one sentinel per character, and any sentinel the text held itself turned into a plain private-use character.
 */
function moneyText(original: string, folded: Folded): string {
  const sentinelAt = new Map<number, string>();
  for (const word of original.matchAll(MONEY_WORD)) {
    const next = String.fromCodePoint(original.codePointAt(word.index + word[0].length) ?? 0);
    const digitFollows = DIGIT.test(next);
    const sentinel = word.groups?.sign !== undefined ? (digitFollows ? SIGN_LEADS : SIGN) : digitFollows ? undefined : word.groups?.dong !== undefined ? DONG : BIG;
    if (sentinel !== undefined) for (let at = word.index; at < word.index + word[0].length; at++) sentinelAt.set(at, sentinel);
  }
  return folded.text.split('').map((char, at) => sentinelAt.get(folded.from[at] ?? -1) ?? (char >= SIGN && char <= SIGN_LEADS ? '' : char)).join('');
}

/** Full-width digits become ASCII; NFKC maps them and leaves every other character as NFC has it. */
const asciiDigits = (text: string) => text.replace(/\p{Nd}/gu, (digit) => digit.normalize('NFKC'));

/** The groups that start inside a match of `pattern`, such as the three groups of one date. */
function groupsIn(text: string, groups: readonly Group[], pattern: RegExp, skip?: (match: RegExpExecArray) => boolean): ReadonlySet<Group> {
  const found = new Set<Group>();
  const matches = [...text.matchAll(pattern)].filter((m) => skip?.(m) !== true).values();
  let next = matches.next();
  for (const group of groups) {
    while (!next.done && next.value.index + next.value[0].length <= group.start) next = matches.next();
    if (!next.done && group.start >= next.value.index) found.add(group);
  }
  return found;
}

/**
 * Finds every national ID in one string: 12 digits anywhere, or 9 to 12 digits within reach of an ID label or in an ID
 * field, the digits possibly grouped. A match spans whole digit groups and stops at the first total that reaches the
 * length, and never takes in a date or an amount, so the date, year or amount after a number stays out of it. A group
 * of one or two digits on the line after a labelled 9-digit number is another field, not part of it.
 */
function idSpans(original: string, idField: boolean): Span[] {
  const folded = fold(original);
  const text = folded.text;
  const labels = [...text.matchAll(ID_LABEL)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
  const afterLabel = (at: number) => idField || labels.some((label) => label.end <= at && at - label.end <= LABEL_REACH_AFTER);
  const beforeLabel = (end: number) => labels.some((label) => label.start >= end && label.start - end <= LABEL_REACH_BEFORE);

  const groups: Group[] = [];
  for (const m of text.matchAll(/\p{Nd}+/gu)) {
    const previous = groups.at(-1);
    const gap = previous === undefined ? null : text.slice(previous.end, m.index);
    groups.push({ start: m.index, end: m.index + m[0].length, digits: asciiDigits(m[0]), gap });
  }
  const dates = groupsIn(text, groups, DATE);
  const priced = moneyText(original, folded);
  // A figure of 9 to 12 digits with only separators between it and an ID label is an ID, whatever its grouping or currency mark:
  // no amount or price that starts inside it counts, so `CMND 097 46 1.769 đ` is one ID and not an ID and a price.
  const idFigures = [...priced.matchAll(new RegExp(MONEY_FIGURE, 'gu'))].filter(
    (figure) =>
      figure[0].replace(/\P{Nd}/gu, '').length >= 9 &&
      figure[0].replace(/\P{Nd}/gu, '').length <= 12 &&
      labels.some((label) => label.end <= figure.index && !/[\p{L}\p{Nd}]/u.test(text.slice(label.end, figure.index))),
  );
  const idFigure = ([figure]: RegExpExecArray, at: number) => idFigures.some((id) => at < id.index + id[0].length && id.index < at + figure.length);
  const startsWithZero = ([figure]: RegExpExecArray) => isZero(figure.charAt(0));
  const notAmount = (match: RegExpExecArray) => startsWithZero(match) || idFigure(match, match.index);
  const notMoney = (match: RegExpExecArray) => {
    const [figure] = match;
    const grouped = GROUPING.test(figure);
    return idFigure(match, match.index) || (startsWithZero(match) && (DIGIT.test(figure.charAt(1)) || !grouped)) || (!grouped && (afterLabel(match.index) || beforeLabel(match.index + figure.length)));
  };
  const amounts = new Set([...groupsIn(priced, groups, AMOUNT, notAmount), ...groupsIn(priced, groups, MONEY, notMoney)]);

  const runOf = (from: number, length: number, join: RegExp): Group[] | undefined => {
    const run: Group[] = [];
    let total = 0;
    for (let at = from; at < groups.length; at++) {
      const group = groups[at];
      if (group === undefined) break;
      if (run.length > 0 && (group.gap === null || !join.test(group.gap))) return undefined;
      run.push(group);
      total += group.digits.length;
      if (total >= length) return total === length ? run : undefined;
    }
    return undefined;
  };
  const codePrefixed = (first: Group) => CODE_PREFIXES.has(LETTERS_BEFORE.exec(text.slice(0, first.start))?.[0].toUpperCase() ?? '');
  const startsAnotherField = (run: readonly Group[]) => {
    const [prefix, last] = run;
    return run.length === 2 && prefix !== undefined && last !== undefined && prefix.digits.length === 9 && last.digits.length <= 2 && /[\r\n]/u.test(last.gap ?? '');
  };

  const isOtherNumber = (from: number, run: readonly Group[]) => {
    const [first] = run;
    if (first === undefined) return false;
    const digits = run.map((group) => group.digits).join('');
    const next = groups[from + run.length];
    // A group of three or more digits cannot finish a 10-digit start to 12, so a phone or tax code stays whole before it.
    const continues = next?.gap !== undefined && next.gap !== null && next.digits.length <= 2 && JOIN_AFTER_LABEL.test(next.gap) && !dates.has(next) && !amounts.has(next);
    return (digits.length === 10 && digits.startsWith('0') && !continues) || OTHER_NUMBER_LABEL.test(` ${text.slice(Math.max(0, first.start - 32), first.start)}`);
  };

  const spans: Span[] = [];
  for (let from = 0; from < groups.length; from++) {
    const first = groups[from];
    if (first === undefined || (first.gap === '.' && first.digits.length !== 12)) continue;
    const labelled = afterLabel(first.start);
    const attempts: readonly (readonly [length: number, join: RegExp, labelled: boolean])[] = labelled
      ? LABELLED_LENGTHS.map((length) => [length, JOIN_AFTER_LABEL, true] as const)
      : [[12, JOIN, false], ...LABELLED_LENGTHS.map((length) => [length, JOIN_AFTER_LABEL, true] as const)];
    for (const [length, join, needsLabel] of attempts) {
      const run = runOf(from, length, join);
      const last = run?.at(-1);
      if (run === undefined || last === undefined) continue;
      const endsInDecimal = length !== 12 && groups[from + run.length]?.gap === '.';
      if (endsInDecimal || run.some((group) => dates.has(group) || amounts.has(group))) continue;
      if (needsLabel && !labelled && !beforeLabel(last.end)) continue;
      if (needsLabel && !labelled && isOtherNumber(from, run)) break;
      if (needsLabel && startsAnotherField(run)) continue;
      if (!needsLabel && codePrefixed(first)) continue;
      const lastChar = last.end - 1;
      const fromAt = folded.from[first.start];
      const toAt = folded.to[lastChar];
      if (fromAt === undefined || toAt === undefined) continue;
      spans.push({ from: fromAt, to: toAt, last4: run.map((group) => group.digits).join('').slice(-4) });
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
