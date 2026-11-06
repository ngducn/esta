import type { Instant } from '../clock/clock';

export const CRON_JOBS = ['invoices', 'lease_status', 'document_sweep', 'keep_alive'] as const;
export type CronJob = (typeof CRON_JOBS)[number];

/** [app rule] A nightly job that has not finished in 26 hours missed a night: a day plus two hours of slack for a late start. */
export const NIGHTLY_WINDOW_MS = 26 * 3_600_000;

/** The newest run of one job, as `public.cron_job_status` returns it. */
export type CronRunRow = { readonly job: string; readonly finishedAt: Instant; readonly ok: boolean };

export type CronHealth =
  | { readonly kind: 'ok' }
  | { readonly kind: 'attention'; readonly failed: readonly CronJob[]; readonly stale: readonly CronJob[] };

export function cronHealth(latest: readonly CronRunRow[], now: Instant): CronHealth {
  const failed: CronJob[] = [];
  const stale: CronJob[] = [];
  for (const job of CRON_JOBS) {
    const row = latest.find((candidate) => candidate.job === job);
    if (row !== undefined && !row.ok) failed.push(job);
    else if (row === undefined || Date.parse(now) - Date.parse(row.finishedAt) > NIGHTLY_WINDOW_MS) stale.push(job);
  }
  return failed.length === 0 && stale.length === 0 ? { kind: 'ok' } : { kind: 'attention', failed, stale };
}
