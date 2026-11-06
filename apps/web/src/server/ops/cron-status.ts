import 'server-only';
import { parseInstant, type Instant } from '@esta/core';
import { cronHealth, type CronHealth } from '@esta/core/ops';
import { createSessionClient } from '@/server/supabase/server';

/** The operator's view of the nightly jobs; the database answers nothing to a member who is not the operator, which reads as every job stale, so callers ask only for an operator. */
export async function loadCronHealth(householdId: string, now: Instant): Promise<CronHealth> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.rpc('cron_job_status', { p_household_id: householdId });
  if (error) throw new Error(`Reading the nightly job status failed: ${error.message}`);
  return cronHealth(
    data.map((row) => ({ job: row.job, finishedAt: parseInstant(row.finished_at), ok: row.ok })),
    now,
  );
}
