import 'server-only';
import type { Instant } from '@esta/core';
import type { CronRunRecord } from '@esta/ops';

export type CronResult = { readonly ok: boolean; readonly households?: number; readonly failed?: readonly unknown[] };

/** Only counts and the error's class name, never its message: a database error can quote a row's values. */
export function describeRun(startedAt: Instant, finishedAt: Instant, outcome: CronResult | { readonly thrown: unknown }): CronRunRecord {
  if ('thrown' in outcome) {
    const name = outcome.thrown instanceof Error ? outcome.thrown.name : 'non-error';
    return { startedAt, finishedAt, ok: false, failure: `threw ${name}`.slice(0, 200), processed: 0, failed: 0 };
  }
  const failed = outcome.failed?.length ?? 0;
  const total = outcome.households ?? 0;
  const failure = outcome.ok ? null : failed > 0 ? `${failed} households failed` : 'the job reported a failure';
  return { startedAt, finishedAt, ok: outcome.ok, failure, processed: Math.max(total - failed, 0), failed };
}
