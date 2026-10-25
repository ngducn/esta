import type { FactSheet } from '@esta/core/guard';

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
