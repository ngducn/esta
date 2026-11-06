import 'server-only';
import type { Instant } from '@esta/core';
import { cronHealth, type CronHealth } from '@esta/core/ops';
import { readCronJobStatus } from '@esta/ops';
import { createSessionClient } from '@/server/supabase/server';

/** The operator's view of the nightly jobs. A member who is not the operator gets no rows, which would read as every job stale, so callers ask only for the operator. */
export async function loadCronHealth(householdId: string, now: Instant): Promise<CronHealth> {
  return cronHealth(await readCronJobStatus(await createSessionClient(), householdId), now);
}
