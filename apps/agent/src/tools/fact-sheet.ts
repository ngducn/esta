import type { FactSheet } from '@esta/core/guard';

export type CitedRecord<T> = T & { readonly handle: string };

/** The run's one `FactSheet`: each record a tool returns gets the next handle, `f1` first, in call order (AGENT.md §6.3). */
export type RunSheet = { readonly sheet: FactSheet; cite<T extends Readonly<Record<string, unknown>>>(record: T): CitedRecord<T> };

export function runSheet(): RunSheet {
  const sheet = new Map<string, Readonly<Record<string, unknown>>>();
  return {
    sheet,
    cite(record) {
      const cited = { handle: `f${sheet.size + 1}`, ...record };
      sheet.set(cited.handle, cited);
      return cited;
    },
  };
}
