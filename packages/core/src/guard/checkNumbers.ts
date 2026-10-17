import type { AllowedIndex, Source } from './collectAllowed';
import { scan, type ExtractedNumber } from './extractNumbers';
import { lookupKeys, neighbourKeys } from './normalize';

/**
 * `cited`: found in a record the same sentence links with `esta://`. `elsewhere`: the sentence links
 * records but the number comes from another result or the context. `none`: the sentence links nothing.
 */
export type CitationStatus = 'cited' | 'elsewhere' | 'none';

export type CheckedNumber = ExtractedNumber &
  (
    | { readonly status: 'matched'; readonly source: Source; readonly citation: CitationStatus }
    | { readonly status: 'unknown' }
    | { readonly status: 'rounding'; readonly nearest: Source }
    | { readonly status: 'unparseable' }
  );

export type Violation = Exclude<CheckedNumber, { status: 'matched' }>;

export type GuardReport = {
  readonly ok: boolean;
  readonly numbers: readonly CheckedNumber[];
  readonly violations: readonly Violation[];
};

const isViolation = (number: CheckedNumber): number is Violation => number.status !== 'matched';

/** Checks every number in the text against the allowed index (AGENT.md §6.3). */
export function checkNumbers(text: string, allowed: AllowedIndex): GuardReport {
  const { numbers, citations } = scan(text);
  const citedBySentence = new Map<number, Set<string>>();
  for (const { id, sentence } of citations) {
    const ids = citedBySentence.get(sentence) ?? new Set<string>();
    ids.add(id);
    citedBySentence.set(sentence, ids);
  }

  const checked = numbers.map((number): CheckedNumber => {
    const { value } = number;
    if (value.kind === 'invalid') return { ...number, status: 'unparseable' };
    const sources = lookupKeys(value).flatMap((key) => allowed.get(key) ?? []);
    const cited = citedBySentence.get(number.sentence);
    const [first] = sources;
    if (first !== undefined) {
      const inCited = cited === undefined ? undefined : sources.find((source) => source.ids.some((id) => cited.has(id)));
      const citation: CitationStatus = cited === undefined ? 'none' : inCited === undefined ? 'elsewhere' : 'cited';
      return { ...number, status: 'matched', source: inCited ?? first, citation };
    }
    if (value.kind === 'compact') {
      const [nearest] = neighbourKeys(value).flatMap((key) => allowed.get(key) ?? []);
      if (nearest !== undefined) return { ...number, status: 'rounding', nearest };
    }
    return { ...number, status: 'unknown' };
  });

  const violations = checked.filter(isViolation);
  return { ok: violations.length === 0, numbers: checked, violations };
}

function describe(violation: Violation): string {
  switch (violation.status) {
    case 'unknown':
      return `"${violation.text}" appears in no tool result`;
    case 'rounding':
      return `"${violation.text}" rounds differently from ${violation.nearest.text} (${violation.nearest.tool} ${violation.nearest.path})`;
    case 'unparseable':
      return `"${violation.text}" is not a readable number`;
  }
}

/** The repair-turn text, naming every offending number (AGENT.md §6.3). */
export function repairMessage(report: GuardReport): string {
  return report.violations.map(describe).join('; ');
}
