import { z } from 'zod';
import type { Metric } from './metrics.ts';
import type { Occurrence } from './measure.ts';

const countsSchema = z.record(z.string(), z.number().int().nonnegative());
const raiseSchema = z.strictObject({ metric: z.string(), from: z.number().int(), to: z.number().int(), reason: z.string().min(1) });
export const baselineSchema = z.strictObject({
  metrics: z.record(z.string(), z.strictObject({ value: z.number().int().nonnegative(), files: countsSchema })),
  raises: z.array(raiseSchema),
});
export type Baseline = z.infer<typeof baselineSchema>;

export type Reading = { readonly metric: Metric; readonly occurrences: readonly Occurrence[] };

export type Verdict =
  | { readonly kind: 'held'; readonly reading: Reading; readonly to: number }
  | { readonly kind: 'rose'; readonly reading: Reading; readonly from: number; readonly to: number; readonly suspects: readonly Occurrence[] }
  | { readonly kind: 'fell'; readonly reading: Reading; readonly from: number; readonly to: number }
  | { readonly kind: 'over-cap'; readonly reading: Reading; readonly cap: number; readonly to: number }
  | { readonly kind: 'missing'; readonly reading: Reading; readonly to: number }
  | { readonly kind: 'unrecorded-raise'; readonly reading: Reading; readonly recorded: number; readonly main: number }
  | { readonly kind: 'retired'; readonly id: string; readonly from: number };

const valueOf = (occurrences: readonly Occurrence[]) => occurrences.reduce((sum, occurrence) => sum + occurrence.weight, 0);

function perFile(occurrences: readonly Occurrence[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const { file, weight } of occurrences) counts.set(file, (counts.get(file) ?? 0) + weight);
  return Object.fromEntries([...counts.entries()].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The occurrences in files whose own count went up: where the new copy most likely is. */
function suspects(occurrences: readonly Occurrence[], before: Record<string, number>): Occurrence[] {
  const after = perFile(occurrences);
  const grown = new Set(Object.keys(after).filter((file) => (after[file] ?? 0) > (before[file] ?? 0)));
  return occurrences.filter((occurrence) => grown.has(occurrence.file));
}

/**
 * The most the baseline may hold for a metric without a new reason: main's count (zero for a metric main does not
 * measure yet), or the highest raise this branch recorded. With no baseline anywhere, the first --update records today's counts.
 */
function allowance(id: string, baseline: Baseline, main: Baseline | undefined): number {
  if (main === undefined) return Number.POSITIVE_INFINITY;
  const onMain = new Set(main.raises.map((raise) => JSON.stringify(raise)));
  const raisedHere = baseline.raises.filter((raise) => raise.metric === id && !onMain.has(JSON.stringify(raise))).map((raise) => raise.to);
  return Math.max(main.metrics[id]?.value ?? 0, ...raisedHere);
}

export function judge(baseline: Baseline, main: Baseline | undefined, readings: readonly Reading[]): Verdict[] {
  const verdicts = readings.map((reading): Verdict => {
    const { id, cap } = reading.metric;
    const to = valueOf(reading.occurrences);
    if (cap !== undefined && to > cap) return { kind: 'over-cap', reading, cap, to };
    const before = baseline.metrics[id];
    if (before === undefined) return { kind: 'missing', reading, to };
    if (before.value > allowance(id, baseline, main)) return { kind: 'unrecorded-raise', reading, recorded: before.value, main: main?.metrics[id]?.value ?? 0 };
    if (to > before.value) return { kind: 'rose', reading, from: before.value, to, suspects: suspects(reading.occurrences, before.files) };
    if (to < before.value) return { kind: 'fell', reading, from: before.value, to };
    return { kind: 'held', reading, to };
  });
  const known = new Set(readings.map(({ metric }) => metric.id));
  const retired = Object.entries(baseline.metrics)
    .filter(([id]) => !known.has(id))
    .map(([id, { value }]): Verdict => ({ kind: 'retired', id, from: value }));
  return [...verdicts, ...retired];
}

export const passes = (verdicts: readonly Verdict[]) => verdicts.every((verdict) => verdict.kind === 'held');

export type Rebased = { readonly baseline: Baseline } | { readonly refused: readonly Verdict[] };

/** Rewrites the baseline from today's counts. A count above what main allows needs `allowRaise`, and its reason is recorded. */
export function rebase(baseline: Baseline, main: Baseline | undefined, readings: readonly Reading[], allowRaise: string | undefined): Rebased {
  const raised = readings.flatMap((reading): Verdict[] => {
    const { id, cap } = reading.metric;
    const to = valueOf(reading.occurrences);
    if (cap !== undefined && to > cap) return [{ kind: 'over-cap', reading, cap, to }];
    const from = allowance(id, baseline, main);
    return to > from ? [{ kind: 'rose', reading, from, to, suspects: suspects(reading.occurrences, baseline.metrics[id]?.files ?? {}) }] : [];
  });
  const refused = raised.filter((verdict) => verdict.kind === 'over-cap' || allowRaise === undefined);
  if (refused.length > 0) return { refused };
  const metrics = Object.fromEntries(readings.map((reading) => [reading.metric.id, { value: valueOf(reading.occurrences), files: perFile(reading.occurrences) }]));
  const raises = raised.flatMap((verdict) => (verdict.kind === 'rose' && allowRaise !== undefined ? [{ metric: verdict.reading.metric.id, from: verdict.from, to: verdict.to, reason: allowRaise }] : []));
  return { baseline: { metrics, raises: [...baseline.raises, ...raises] } };
}

export const serialize = (baseline: Baseline) => `${JSON.stringify(baseline, null, 2)}\n`;

const SHOWN = 20;

function listing(occurrences: readonly Occurrence[]): string[] {
  const shown = occurrences.slice(0, SHOWN).map(({ file, line, text }) => `      ${file}:${line}  ${text}`);
  return occurrences.length > SHOWN ? [...shown, `      and ${occurrences.length - SHOWN} more`] : shown;
}

function advice({ message, home, section }: Metric): string[] {
  const raise =
    home.pending === undefined
      ? []
      : [`    Until issue #${home.pending.issue} lands, a change that needs this records a raise for the root to countersign: pnpm quality --update --allow-raise "<why> (until #${home.pending.issue})"`];
  return [`    ${message}`, `    Use instead: ${home.use}`, ...raise, `    See ARCHITECTURE.md#${section}`];
}

export function report(verdicts: readonly Verdict[]): string[] {
  return verdicts.flatMap((verdict): string[] => {
    switch (verdict.kind) {
      case 'held':
        return [];
      case 'rose':
        return [
          `FAIL ${verdict.reading.metric.id} rose from ${verdict.from} to ${verdict.to}.`,
          ...advice(verdict.reading.metric),
          '    Where it grew:',
          ...listing(verdict.suspects.length > 0 ? verdict.suspects : verdict.reading.occurrences),
        ];
      case 'over-cap':
        return [`FAIL ${verdict.reading.metric.id} is ${verdict.to}; the cap is ${verdict.cap}.`, ...advice(verdict.reading.metric), ...listing(verdict.reading.occurrences)];
      case 'fell':
        return [`FAIL ${verdict.reading.metric.id} fell from ${verdict.from} to ${verdict.to}. Lock in the gain: pnpm quality --update`];
      case 'missing':
        return [`FAIL ${verdict.reading.metric.id} is missing from quality/baseline.json. Restore it with pnpm quality --update; a count above main's needs --allow-raise "<reason>".`];
      case 'unrecorded-raise':
        return [
          `FAIL ${verdict.reading.metric.id} is ${verdict.recorded} in quality/baseline.json, above ${verdict.main} on main, with no raise recorded. Restore main's count, or record why: pnpm quality --update --allow-raise "<reason>"`,
        ];
      case 'retired':
        return [`FAIL ${verdict.id} is in the baseline but no longer measured. Drop it: pnpm quality --update`];
    }
  });
}
