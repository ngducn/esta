import { wallTime } from '../agent/worker-status';
import type { Instant } from '../clock/clock';
import { businessDate } from '../clock/resolve';
import type { IsoDate } from '../date/iso-date';

/** A job kind that runs once a day at `daily`, `HH:mm` in the business timezone (AGENT.md §3). */
export type DailyJob = { readonly kind: string; readonly daily: string };

export type PlannedJob = { readonly kind: string; readonly householdId: string; readonly idempotencyKey: string; readonly runAfter: Instant };

/** The instant the business timezone's wall clock reads `time` on `date`. */
function zonedInstant(date: IsoDate, time: string, timezone: string): Instant {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const asIso = new Date(guess).toISOString() as Instant;
  const wall = Date.parse(`${businessDate(asIso, timezone)}T${wallTime(asIso, timezone)}:00Z`);
  return new Date(guess - (wall - guess)).toISOString() as Instant;
}

/**
 * Today's daily jobs whose time has come and that no job holds the key of yet, earliest schedule first, so a worker
 * that starts late queues them in the order their dependencies need (AGENT.md §3). Only today is backfilled.
 */
export function planDailyJobs(
  schedule: readonly DailyJob[],
  at: { readonly householdIds: readonly string[]; readonly now: Instant; readonly timezone: string; readonly existingKeys: ReadonlySet<string> },
): PlannedJob[] {
  const today = businessDate(at.now, at.timezone);
  return schedule
    .map((job) => ({ ...job, runAfter: zonedInstant(today, job.daily, at.timezone) }))
    .filter((job) => job.runAfter <= at.now)
    .toSorted((a, b) => a.runAfter.localeCompare(b.runAfter))
    .flatMap((job) => at.householdIds.map((householdId) => ({ kind: job.kind, householdId, idempotencyKey: `${job.kind}:${householdId}:${today}`, runAfter: job.runAfter })))
    .filter((job) => !at.existingKeys.has(job.idempotencyKey));
}
