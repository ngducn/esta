export type RunUsage = { readonly kind: string; readonly numTurns: number | null; readonly costUsd: number | null; readonly inputTokens: number; readonly outputTokens: number };

export type UsageTotals = { readonly runs: number; readonly turns: number; readonly inputTokens: number; readonly outputTokens: number; readonly costUsd: number };

export type KindUsage = UsageTotals & { readonly kind: string };

const totalsOf = (run: RunUsage): UsageTotals => ({ runs: 1, turns: run.numTurns ?? 0, inputTokens: run.inputTokens, outputTokens: run.outputTokens, costUsd: run.costUsd ?? 0 });

export function sumUsage(rows: readonly UsageTotals[]): UsageTotals {
  return rows.reduce((sum, row) => ({ runs: sum.runs + row.runs, turns: sum.turns + row.turns, inputTokens: sum.inputTokens + row.inputTokens, outputTokens: sum.outputTokens + row.outputTokens, costUsd: sum.costUsd + row.costUsd }), {
    runs: 0,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  });
}

/** Usage per job kind, the costliest first, then the kind run most, then by name. */
export function usageByKind(runs: readonly RunUsage[]): KindUsage[] {
  const byKind = new Map<string, UsageTotals[]>();
  for (const run of runs) byKind.set(run.kind, [...(byKind.get(run.kind) ?? []), totalsOf(run)]);
  return [...byKind]
    .map(([kind, rows]) => ({ kind, ...sumUsage(rows) }))
    .toSorted((a, b) => b.costUsd - a.costUsd || b.runs - a.runs || a.kind.localeCompare(b.kind));
}
