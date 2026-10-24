import type { IsoDate } from '../date/iso-date';
import type { Locale } from '../format';
import { toWholeDong, type Decimal } from '../parse/decimal';
import { extractNumbers } from './extract-numbers';
import { canonicalDate, countOf, indexKeys, lookupKey, type CanonicalNumber } from './normalize';
import { onScreenText } from './on-screen-text';

/** What the prompt tells the model besides tool results (AGENT.md §6.3): today's date, the household name, its locale. */
export type GuardContext = { readonly today: IsoDate; readonly householdName: string; readonly locale: Locale };

/**
 * The numbers one run may write: every key its tool results and context satisfy, and the tokens with digits a tool
 * string holds that read as no number, such as `Q7`, which may only be quoted whole.
 */
export type AllowedNumbers = { readonly locale: Locale; readonly keys: ReadonlySet<string>; readonly verbatim: ReadonlySet<string> };

const FIELD_SUFFIXES: readonly (readonly [suffix: string, read: (decimal: Decimal, text: string) => CanonicalNumber | null])[] = [
  ['_vnd', (decimal) => (decimal.scale === 0 ? { kind: 'amount', vnd: decimal.digits } : null)],
  ['_bp', (decimal) => (decimal.scale === 0 ? { kind: 'ratio', bp: decimal.digits } : null)],
  ['_percent', (decimal) => {
    const bp = toWholeDong(decimal, 100n);
    return bp.ok ? { kind: 'ratio', bp: bp.value } : null;
  }],
  ['_year', (decimal, text) => (decimal.scale === 0 && text.length === 4 ? canonicalDate(Number(text), null, null) : null)],
];

function rawNumbers(field: string, text: string): CanonicalNumber[] {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(text);
  if (match === null) return [];
  const [, sign = '', integer = '', fraction = ''] = match;
  const decimal = { digits: BigInt(integer + fraction), scale: fraction.length };
  const negate = (number: CanonicalNumber | null): CanonicalNumber | null => {
    if (number === null || sign === '') return number;
    if (number.kind === 'amount') return { kind: 'amount', vnd: -number.vnd };
    return number.kind === 'ratio' ? { kind: 'ratio', bp: -number.bp } : null;
  };
  const suffixed = FIELD_SUFFIXES.filter(([suffix]) => `_${field}`.endsWith(suffix)).map(([, read]) => negate(read(decimal, integer)));
  return [countOf(decimal, integer.length + fraction.length, sign === '-' ? '-' : ''), ...suffixed].filter((number) => number !== null);
}

/** Walks raw fields, `_display` strings and labels such as `Phòng 5`, and the context values. */
export function collectAllowed(toolResults: readonly unknown[], context: GuardContext): AllowedNumbers {
  const keys = new Set<string>();
  const verbatim = new Set<string>();
  const allow = (value: CanonicalNumber) => {
    for (const key of indexKeys(value)) keys.add(key);
  };
  const walk = (value: unknown, field: string): void => {
    if (typeof value === 'number' || typeof value === 'bigint') rawNumbers(field, String(value)).forEach(allow);
    else if (typeof value === 'string') {
      if (/^-?\d+$/u.test(value)) rawNumbers(field, value).forEach(allow);
      for (const number of extractNumbers(value, context.locale)) {
        if (number.value === null) verbatim.add(number.text);
        else allow(number.value);
      }
    } else if (Array.isArray(value)) value.forEach((item) => walk(item, field));
    else if (typeof value === 'object' && value !== null) for (const [key, child] of Object.entries(value)) walk(child, key);
  };
  toolResults.forEach((result) => walk(result, ''));
  walk(context.householdName, '');
  allow({ kind: 'date', iso: context.today });
  return { locale: context.locale, keys, verbatim };
}

const BIDI = /\S*\p{Bidi_Control}\S*/gu;

/**
 * The numbers in `markdown`, as `SafeMarkdown` shows it, that the run does not allow, as written and each once. A
 * bidi control reorders what is shown (U+202E shows `12` as `21`), so every word holding one is offending.
 */
export function checkNumbers(markdown: string, allowed: AllowedNumbers): string[] {
  const reordered = [...markdown.matchAll(BIDI)].map(([word]) =>
    word.replace(/\p{Bidi_Control}/gu, (control) => `U+${control.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}`),
  );
  const offending = onScreenText(markdown)
    .flatMap((block) => extractNumbers(block, allowed.locale))
    .flatMap(({ text, value }) => ((value === null ? allowed.verbatim.has(text) : allowed.keys.has(lookupKey(value))) ? [] : [text]));
  return [...new Set([...reordered, ...offending])];
}

/** The repair turn's message: the model reads which numbers to take from a tool result or leave out. */
export function repairMessage(offending: readonly string[]): string {
  const quoted = offending.map((text) => `"${text}"`).join(', ');
  return `These numbers appear in no tool result of this run: ${quoted}. Use only numbers and display strings the tools returned, or leave the number out.`;
}
