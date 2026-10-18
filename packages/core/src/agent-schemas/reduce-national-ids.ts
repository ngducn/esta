/** A key that holds an ID number by name, such as `id_last4`, `id_number` or `cccd`. */
const ID_KEY = /(?:^|_)(?:id|cccd|cmnd|cmtnd|idno|identity)(?:_|$)/i;

/** Words that announce an ID number. A 9-digit run counts as a CMND only within `LABEL_REACH` characters after one. */
const ID_LABEL = /cccd|cmtnd|cmnd|cmt|căn cước|chứng minh|định danh|đdcn|số thẻ|\bid\b/giu;
const LABEL_REACH = 40;
/** A label glued to its number, as OCR prints `CCCD012345678901`. Any other ASCII letter before the digits makes them part of a code. */
const GLUED_LABEL = /(?:cccd|cmtnd|cmnd|cmt|đdcn|id)$/iu;

/** Between two digit groups of one number: up to three spaces of any kind on one line, or a single dot or dash. */
const JOIN = /^(?:[^\S\n\r]{1,3}|[.-])$/u;
/** After a label the number may also break across a line or use slashes. */
const JOIN_AFTER_LABEL = /^(?:\s{1,3}|[.\-/])$/u;
/** A Vietnamese amount groups thousands with dots, never starts with 0 (every CCCD does) and names its currency. */
const CURRENCY_AFTER = /^\s?(?:đ|đồng|vnd|vnđ)(?![\p{L}\p{N}])/iu;
const ASCII_LETTER = /[A-Za-z]/;

type Group = { readonly start: number; readonly end: number; readonly digits: string };
type Span = { readonly from: number; readonly to: number };

/** Full-width digits become ASCII; NFKC maps them and leaves every other character as NFC has it. */
const asciiDigits = (text: string) => text.replace(/\p{Nd}/gu, (digit) => digit.normalize('NFKC'));

/**
 * Finds every national ID in one string: 12 digits anywhere, or 9 digits after an ID label or in an ID field, the
 * digits possibly grouped by spaces, dots or dashes. A match spans whole digit groups and stops at the first total
 * that reaches the length, so a date or a year after the number stays out of it.
 */
function idSpans(text: string, idField: boolean): Span[] {
  const groups: Group[] = [...text.matchAll(/\p{Nd}+/gu)].map((m) => ({ start: m.index, end: m.index + m[0].length, digits: asciiDigits(m[0]) }));
  const labelEnds = [...text.matchAll(ID_LABEL)].map((m) => m.index + m[0].length);
  const afterLabel = (at: number) => idField || labelEnds.some((end) => end <= at && at - end <= LABEL_REACH);
  const gap = (i: number) => text.slice(groups[i - 1]!.end, groups[i]!.start);
  const joined = (i: number) => i > 0 && i < groups.length && (afterLabel(groups[i - 1]!.start) ? JOIN_AFTER_LABEL : JOIN).test(gap(i));
  const dotJoined = (i: number) => joined(i) && gap(i) === '.';

  const gluedToCode = (from: number, to: number) => {
    const before = text.slice(0, groups[from]!.start);
    return (ASCII_LETTER.test(before.at(-1) ?? '') && !GLUED_LABEL.test(before)) || ASCII_LETTER.test(text[groups[to]!.end] ?? '');
  };
  const isAmount = (from: number, to: number) => {
    const first = groups[from]!.digits;
    if (first.startsWith('0') || first.length > 3) return false;
    for (let i = from + 1; i <= to; i++) if (groups[i]!.digits.length !== 3 || gap(i) !== '.') return false;
    return CURRENCY_AFTER.test(text.slice(groups[to]!.end));
  };
  const matchAt = (from: number, length: number): number | undefined => {
    let total = 0;
    for (let to = from; to < groups.length && total < length; to++) {
      if (to > from && !joined(to)) return undefined;
      total += groups[to]!.digits.length;
      if (total === length) return to;
    }
    return undefined;
  };

  const spans: Span[] = [];
  for (let from = 0; from < groups.length; from++) {
    if (dotJoined(from)) continue;
    const labelled = afterLabel(groups[from]!.start);
    for (const length of labelled ? [12, 9] : [12]) {
      const to = matchAt(from, length);
      if (to === undefined || dotJoined(to + 1) || gluedToCode(from, to) || (!labelled && isAmount(from, to))) continue;
      spans.push({ from: groups[from]!.start, to: groups[to]!.end });
      from = to;
      break;
    }
  }
  return spans;
}

type Found = { readonly last4: string };

function reduceText(text: string, idField: boolean, found: Found[]): string {
  const nfc = text.normalize('NFC');
  const spans = idSpans(nfc, idField);
  if (spans.length === 0) return text;
  const last4s = spans.map(({ from, to }) => asciiDigits(nfc.slice(from, to)).replace(/\D/g, '').slice(-4));
  found.push(...last4s.map((last4) => ({ last4 })));
  if (idField) return last4s[0]!;
  let cursor = 0;
  const parts = spans.map(({ from, to }, i) => {
    const part = nfc.slice(cursor, from) + last4s[i];
    cursor = to;
    return part;
  });
  return parts.join('') + nfc.slice(cursor);
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
 * digits, and so does a 9-digit run after an ID label or in an ID field. A run glued to a code's letters, such as
 * `PE012345678901`, and a dotted amount in đồng stay. An empty `id_last4` is filled from the text beside it.
 */
export function reduceNationalIds<T>(result: T): T {
  return reduceNode(result, '', []) as T;
}
