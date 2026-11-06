import type { Instant } from '@esta/core';
import { parseInstant } from '@esta/core';
import type { CronJob, CronRunRow } from '@esta/core/ops';
import type { Db } from './db';

export type CronRunRecord = {
  readonly startedAt: Instant;
  readonly finishedAt: Instant;
  readonly ok: boolean;
  readonly failure: string | null;
  readonly processed: number;
  readonly failed: number;
};

/** Service role only: the table grants nobody else a write. A lost record must not hide the job's own result, so a failed insert is logged and the run goes on. */
export async function recordCronRun(db: Db, job: CronJob, run: CronRunRecord): Promise<void> {
  const { error } = await db.from('cron_runs').insert({
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

/** The newest run of each job, for the household's operator; the database returns nothing to anyone else. */
export async function readCronJobStatus(db: Db, householdId: string): Promise<CronRunRow[]> {
  const { data, error } = await db.rpc('cron_job_status', { p_household_id: householdId });
  if (error) throw new Error(`Reading the nightly job status failed: ${error.message}`);
  return data.map((row) => ({ job: row.job, finishedAt: parseInstant(row.finished_at), ok: row.ok }));
}
