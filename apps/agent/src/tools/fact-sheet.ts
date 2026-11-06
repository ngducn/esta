import type { TypedValue } from '@esta/core/calc';
import type { FactSheet } from '@esta/core/guard';
import { formatBps, formatVnd, type Locale } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';

/** The handles a calculation's operands came from, kept on its record out of sight (a symbol key never reaches the model or JSON) so the working can be walked back. */
export const CALC_OPERANDS = Symbol('calcOperands');

export type CitedRecord<T> = T & { readonly handle: string };

/** The run's one `FactSheet`: each record a tool returns gets the next handle, `f{first}` first, in call order (AGENT.md §6.3). */
export type RunSheet = { readonly sheet: FactSheet; cite<T extends Readonly<Record<string, unknown>>>(record: T): CitedRecord<T> };

export function runSheet(first = 1): RunSheet {
  const sheet = new Map<string, Readonly<Record<string, unknown>>>();
  return {
    sheet,
    cite(record) {
      const cited = { handle: `f${first + sheet.size}`, ...record };
      sheet.set(cited.handle, cited);
      return cited;
    },
  };
}

/** Answers the same arguments with the same promise, so a repeated tool call keeps its handles and a repeated read runs once. */
export function sameAnswer<A extends unknown[], T>(run: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  const answers = new Map<string, Promise<T>>();
  return (...args) => {
    const key = JSON.stringify(args);
    const earlier = answers.get(key);
    if (earlier !== undefined) return earlier;
    const answer = run(...args);
    answers.set(key, answer);
    return answer;
  };
}

export const typedVnd = (value: Vnd | null): TypedValue | null => (value === null ? null : { kind: 'vnd', value });
export const typedBp = (value: number | null): TypedValue | null => (value === null ? null : { kind: 'bp', value });

type Field<S extends string, D = string | null> = { readonly [K in `${S}_display`]: D } & { readonly [K in `${S}_typed`]: TypedValue | null };

/**
 * `<stem>_display` and `<stem>_typed` for one amount, written from the one value so the string the answer shows and the
 * number a calculation reads cannot differ. Every money field a read tool returns comes from here (AGENT.md §4).
 */
export function vndField<S extends string>(stem: S, value: Vnd, locale: Locale): Field<S, string>;
export function vndField<S extends string>(stem: S, value: Vnd | null, locale: Locale): Field<S>;
export function vndField<S extends string>(stem: S, value: Vnd | null, locale: Locale): Field<S> {
  return { [`${stem}_display`]: value === null ? null : formatVnd(value, locale), [`${stem}_typed`]: typedVnd(value) } as Field<S>;
}

/** `<stem>_display` and `<stem>_typed` for one percent in basis points, from the one value. */
export function bpField<S extends string>(stem: S, value: number | null, locale: Locale): Field<S> {
  return { [`${stem}_display`]: value === null ? null : formatBps(value, locale), [`${stem}_typed`]: typedBp(value) } as Field<S>;
}
