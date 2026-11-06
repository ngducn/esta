import 'server-only';
import type { Instant } from '@esta/core';
import type { CronJob } from '@esta/core/ops';
import type { CronClient } from './supabase';

export type CronResult = { readonly ok: boolean; readonly households?: number; readonly failed?: readonly unknown[] };

export type CronRunRecord = {
  readonly startedAt: Instant;
  readonly finishedAt: Instant;
  readonly ok: boolean;
  readonly failure: string | null;
  readonly processed: number;
  readonly failed: number;
};

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

/** A lost record must not hide the job's own result, so a failed insert is logged and the run goes on. */
export async function recordCronRun(client: CronClient, job: CronJob, run: CronRunRecord): Promise<void> {
  const { error } = await client.from('cron_runs').insert({
    job,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    ok: run.ok,
    failure: run.failure,
    households_processed: run.processed,
    households_failed: run.failed,
  });
  if (error) console.error(`Recording the ${job} cron run failed: ${error.message}`);
}
