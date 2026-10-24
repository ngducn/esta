import type { IsoDate } from '../date/iso-date';
import type { Locale } from '../format';
import { extractNumbers } from './extract-numbers';
import { indexKeys, lookupKey, type CanonicalNumber } from './normalize';

/** What the prompt tells the model besides tool results (AGENT.md §6.3): today's date, the household name, its locale. */
export type GuardContext = { readonly today: IsoDate; readonly householdName: string; readonly locale: Locale };

/**
 * The numbers one run may write: every key its tool results and context satisfy, and the tokens with digits a tool
 * string holds that read as no number, such as `Q7`, which may only be quoted whole.
 */
export type AllowedNumbers = { readonly locale: Locale; readonly keys: ReadonlySet<string>; readonly verbatim: ReadonlySet<string> };

/** A raw field's suffix says what its number is (AGENT.md §4): `_vnd` is đồng and `_bp` basis points. */
function rawNumber(field: string, value: number): CanonicalNumber[] {
  const count: CanonicalNumber = { kind: 'count', value };
  if (!Number.isSafeInteger(value)) return [count];
  if (field.endsWith('_vnd')) return [{ kind: 'amount', vnd: value }];
  if (field.endsWith('_bp')) return [count, { kind: 'ratio', bp: value }];
  return [count];
}

/** Walks raw fields, `_display` strings and labels such as `Phòng 5`, and the context values. */
export function collectAllowed(toolResults: readonly unknown[], context: GuardContext): AllowedNumbers {
  const keys = new Set<string>();
  const verbatim = new Set<string>();
  const allow = (value: CanonicalNumber) => {
    for (const key of indexKeys(value)) keys.add(key);
  };
  const walk = (value: unknown, field: string): void => {
    if (typeof value === 'number' && Number.isFinite(value)) rawNumber(field, value).forEach(allow);
    else if (typeof value === 'string') {
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

/** The numbers in `text` the run does not allow, as written, each once. Pass Markdown through `onScreenText` first. */
export function checkNumbers(text: string, allowed: AllowedNumbers): string[] {
  const offending = extractNumbers(text, allowed.locale).flatMap(({ text: written, value }) =>
    (value === null ? allowed.verbatim.has(written) : allowed.keys.has(lookupKey(value))) ? [] : [written],
  );
  return [...new Set(offending)];
}

/** The repair turn's message: the model reads which numbers to take from a tool result or leave out. */
export function repairMessage(offending: readonly string[]): string {
  return `These numbers appear in no tool result of this run: ${offending.map((text) => `"${text}"`).join(', ')}. Use only numbers and display strings the tools returned, or leave the number out.`;
}
