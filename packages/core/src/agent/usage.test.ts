import { describe, expect, it } from 'vitest';
import { sumUsage, usageByKind, type RunUsage } from './usage';

const run = (kind: string, patch: Partial<RunUsage> = {}): RunUsage => ({ kind, numTurns: 3, costUsd: 0.01, inputTokens: 100, outputTokens: 20, ...patch });

describe('usageByKind', () => {
  it('sums runs, turns, tokens and cost per kind, the costliest kind first', () => {
    const rows = usageByKind([run('ask'), run('weekly_review', { numTurns: 14, costUsd: 0.5 }), run('ask', { numTurns: null, costUsd: null, inputTokens: 0 })]);
    expect(rows).toEqual([
      { kind: 'weekly_review', runs: 1, turns: 14, inputTokens: 100, outputTokens: 20, costUsd: 0.5 },
      { kind: 'ask', runs: 2, turns: 3, inputTokens: 100, outputTokens: 40, costUsd: 0.01 },
    ]);
    expect(sumUsage(rows)).toEqual({ runs: 3, turns: 17, inputTokens: 200, outputTokens: 60, costUsd: 0.51 });
  });

  it('orders kinds of equal cost by the runs they took, then by name, as replay runs cost nothing', () => {
    expect(usageByKind([run('ping', { costUsd: 0 }), run('ask', { costUsd: 0 }), run('portfolio_watch', { costUsd: 0 }), run('portfolio_watch', { costUsd: 0 })]).map((row) => row.kind)).toEqual(['portfolio_watch', 'ask', 'ping']);
    expect(usageByKind([])).toEqual([]);
  });
});
