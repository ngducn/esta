import type { AllowedIndex, Source } from './collectAllowed';
import { scan, type ExtractedNumber } from './extractNumbers';
import { lookupKeys, negated, neighbourKeys } from './normalize';

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

/** A sign written in front of a number makes it claim that sign; see `negated`. */
const SIGNED = /^[-−+]/u;
/** A bare digit run may quote a code-shaped value from the run as written, such as a tax_id `0312345678`. */
const DIGITS_ONLY = /^\d+$/u;

const isViolation = (number: CheckedNumber): number is Violation => number.status !== 'matched';

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
    const opposite = SIGNED.test(number.text) ? null : negated(value);
    const claims = opposite === null ? [value] : [value, opposite];
    const literal = DIGITS_ONLY.test(number.text) ? [`code:${number.text}`] : [];
    const sources = [...claims.flatMap(lookupKeys), ...literal].flatMap((key) => allowed.get(key) ?? []);
    const cited = citedBySentence.get(number.sentence);
    const [first] = sources;
    if (first !== undefined) {
      const inCited = cited === undefined ? undefined : sources.find((source) => source.ids.some((id) => cited.has(id)));
      const citation: CitationStatus = cited === undefined ? 'none' : inCited === undefined ? 'elsewhere' : 'cited';
      return { ...number, status: 'matched', source: inCited ?? first, citation };
    }
    const [nearest] = claims.flatMap(neighbourKeys).flatMap((key) => allowed.get(key) ?? []);
    return nearest === undefined ? { ...number, status: 'unknown' } : { ...number, status: 'rounding', nearest };
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

export function repairMessage(report: GuardReport): string {
  return report.violations.map(describe).join('; ');
}
