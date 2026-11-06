import { extractTypedNumbersFrom } from '@esta/core/guard';
import type { Locale } from '@esta/core/format';
import type { CitedRecord, RunSheet } from './fact-sheet';

export type TypedRecord = CitedRecord<{ value_display: string; value_typed: unknown; typed_text: string }>;

/** A record for each number she wrote in `messages`, once per value, so a calculation can take it as an operand by handle (P5-15). */
export function citeTypedNumbers(cite: RunSheet['cite'], messages: readonly string[], locale: Locale): TypedRecord[] {
  const seen = new Set<string>();
  return extractTypedNumbersFrom(messages, locale).flatMap(({ value_display, typed, typed_text }) => {
    const key = JSON.stringify(typed);
    if (seen.has(key)) return [];
    seen.add(key);
    return [cite({ value_display, value_typed: typed, typed_text })];
  });
}
