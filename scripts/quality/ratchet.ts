import { z } from 'zod';
import type { Metric } from './metrics.ts';
import type { Occurrence } from './measure.ts';

const countsSchema = z.record(z.string(), z.number().int().nonnegative());
export const baselineSchema = z.strictObject({
  metrics: z.record(z.string(), z.strictObject({ value: z.number().int().nonnegative(), files: countsSchema })),
  raises: z.array(z.strictObject({ metric: z.string(), from: z.number().int(), to: z.number().int(), reason: z.string().min(1) })),
});
export type Baseline = z.infer<typeof baselineSchema>;

export type Reading = { readonly metric: Metric; readonly occurrences: readonly Occurrence[] };

export type Verdict =
  | { readonly kind: 'held'; readonly reading: Reading; readonly to: number }
  | { readonly kind: 'rose'; readonly reading: Reading; readonly from: number; readonly to: number; readonly suspects: readonly Occurrence[] }
  | { readonly kind: 'fell'; readonly reading: Reading; readonly from: number; readonly to: number }
  | { readonly kind: 'over-cap'; readonly reading: Reading; readonly cap: number; readonly to: number }
  | { readonly kind: 'new'; readonly reading: Reading; readonly to: number }
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

export function judge(baseline: Baseline, readings: readonly Reading[]): Verdict[] {
  const verdicts = readings.map((reading): Verdict => {
    const to = valueOf(reading.occurrences);
    const { cap } = reading.metric;
    if (cap !== undefined && to > cap) return { kind: 'over-cap', reading, cap, to };
    const before = baseline.metrics[reading.metric.id];
    if (before === undefined) return { kind: 'new', reading, to };
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

export function rebase(baseline: Baseline, verdicts: readonly Verdict[], allowRaise: string | undefined): Rebased {
  const refused = verdicts.filter((verdict) => verdict.kind === 'over-cap' || (verdict.kind === 'rose' && allowRaise === undefined));
  if (refused.length > 0) return { refused };
  const metrics: Baseline['metrics'] = {};
  for (const verdict of verdicts) {
    if (verdict.kind === 'retired' || verdict.kind === 'over-cap') continue;
    metrics[verdict.reading.metric.id] = { value: verdict.to, files: perFile(verdict.reading.occurrences) };
  }
  const raises = verdicts.flatMap((verdict) =>
    verdict.kind === 'rose' && allowRaise !== undefined ? [{ metric: verdict.reading.metric.id, from: verdict.from, to: verdict.to, reason: allowRaise }] : [],
  );
  return { baseline: { metrics, raises: [...baseline.raises, ...raises] } };
}

export const serialize = (baseline: Baseline) => `${JSON.stringify(baseline, null, 2)}\n`;

const SHOWN = 20;

function listing(occurrences: readonly Occurrence[]): string[] {
  const shown = occurrences.slice(0, SHOWN).map(({ file, line, text }) => `      ${file}:${line}  ${text}`);
  return occurrences.length > SHOWN ? [...shown, `      and ${occurrences.length - SHOWN} more`] : shown;
}

function advice(metric: Metric): string[] {
  return [`    ${metric.message}`, `    Use instead: ${metric.home}`, `    See ARCHITECTURE.md#${metric.section}`];
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
      case 'new':
        return [`FAIL ${verdict.reading.metric.id} has no baseline yet (${verdict.to} now). Record it: pnpm quality --update`];
      case 'retired':
        return [`FAIL ${verdict.id} is in the baseline but no longer measured. Drop it: pnpm quality --update`];
    }
  });
}
