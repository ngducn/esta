import type { Result } from '../result';
import type { FactSheet, NoteRule, NoteViolation } from './index';
import { visibleText } from './visible-text';

const PLACEHOLDER = /\{\{(f(?:0|[1-9]\d*))\.([a-z][a-z0-9_]*)\}\}/g;
const FIRST_MASK = 0xe000;
export const MASKS = /[\uE000-\uF8FF]/gu;
export const maskIndex = (mask: string) => (mask.codePointAt(0) ?? FIRST_MASK) - FIRST_MASK;

export type Occurrence = { readonly placeholder: string; readonly handle: string; readonly field: string };

/** Each placeholder becomes its own private-use character, so the template renders with one opaque glyph per value. */
export function maskPlaceholders(template: string): { masked: string; occurrences: Occurrence[] } {
  const occurrences: Occurrence[] = [];
  const masked = template.replace(PLACEHOLDER, (placeholder: string, handle: string, field: string) =>
    String.fromCodePoint(FIRST_MASK + occurrences.push({ placeholder, handle, field }) - 1),
  );
  return { masked, occurrences };
}

type Cell = { readonly record: Readonly<Record<string, unknown>> | undefined; readonly field: string; readonly value: unknown };

const CITABLE = /_(display|compact|relative|label|name)$/;
const UNSAFE = /[\p{Bidi_Control}\uE000-\uF8FF]|(?![\n\r])\p{Cc}/u;

/** The first rule a cell breaks, in this order. */
const FILL_RULES: ReadonlyArray<{ readonly rule: NoteRule; readonly breaks: (cell: Cell) => boolean }> = [
  { rule: 'unknown_handle', breaks: ({ record }) => record === undefined },
  { rule: 'unknown_field', breaks: ({ record, field }) => record === undefined || !Object.hasOwn(record, field) },
  { rule: 'not_citable', breaks: ({ field, value }) => typeof value !== 'string' || !CITABLE.test(field) },
  { rule: 'unsafe_value', breaks: ({ value }) => typeof value === 'string' && UNSAFE.test(value) },
];

/** The value as it reads on screen: one line, trimmed. */
export function fillValue({ handle, field }: Occurrence, sheet: FactSheet): Result<string, NoteRule> {
  const record = sheet.get(handle);
  const cell: Cell = { record, field, value: record?.[field] };
  const broken = FILL_RULES.find(({ breaks }) => breaks(cell));
  if (broken !== undefined || typeof cell.value !== 'string') return { ok: false, reason: broken?.rule ?? 'not_citable' };
  return { ok: true, value: cell.value.replace(/[\r\n\u2028\u2029]+/gu, ' ').trim() };
}

/** Backslash-escapes the punctuation Markdown could read as syntax. NBSP and the rest of the value stay as written. */
export const escapeMarkdown = (value: string) => value.replace(/[\\`*_[\]<>&#!~|{}+-]/g, '\\$&');

const SEAM = /([\uE000-\uF8FF])[\s.,'’·]*(?=([\uE000-\uF8FF]))/gu;

/** Two values that meet digit to digit across nothing but spaces and dots read as one number. */
export function seams(shown: string, values: ReadonlyArray<string | undefined>): NoteViolation[] {
  return [...shown.matchAll(SEAM)].flatMap(([gap, left = '', right = '']) => {
    const before = values[maskIndex(left)];
    const after = values[maskIndex(right)];
    const touch = before !== undefined && after !== undefined && /\p{N}$/u.test(before) && /^\p{N}/u.test(after);
    return touch ? [{ rule: 'seam', text: `${gap}${right}` }] : [];
  });
}

/** Filling must not change what renders around a value; returns the first line that does. */
export function layoutChange(shown: string, filled: string, values: ReadonlyArray<string | undefined>): NoteViolation[] {
  const expected = shown.replace(MASKS, (mask) => values[maskIndex(mask)] ?? '');
  const actual = visibleText(filled);
  if (expected === actual) return [];
  const [want, got] = [expected.split('\n'), actual.split('\n')];
  let line = 0;
  while (want[line] === got[line]) line += 1;
  return [{ rule: 'layout', text: got[line] ?? want[line] ?? '' }];
}
