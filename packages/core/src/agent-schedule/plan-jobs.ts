import { wallTime } from '../agent/worker-status';
import type { Instant } from '../clock/clock';
import { businessDate } from '../clock/resolve';
import { isoWeek, weekday } from '../date/calendar';
import { isIsoDate, type IsoDate } from '../date/iso-date';

/**
 * A kind the scheduler queues for every household at `at`, `HH:mm` in the business timezone: every day, or with
 * `weekday` (0 is Sunday) once a week on that day (AGENT.md §3).
 */
export type ScheduledJob = { readonly kind: string; readonly at: string; readonly weekday?: number };

export type PlannedJob = { readonly kind: string; readonly householdId: string; readonly idempotencyKey: string; readonly runAfter: Instant };

export function scheduleKey(job: ScheduledJob, householdId: string, today: IsoDate): string {
  return `${job.kind}:${householdId}:${job.weekday === undefined ? today : isoWeek(today)}`;
}

/** The key of the run a job repeats: Thử lại keys its new job `{key}:retry:{n}` (`public.retry_agent_job`). */
export const firstRunKey = (key: string): string => key.replace(/:retry:\d+$/, '');

const ISO_WEEK = /^\d{4}-W\d{2}$/;

/** The day or ISO week `scheduleKey` named, through any retries; null for a key the scheduler did not write. */
export function scheduledPeriod(key: string | null): string | null {
  const period = key === null ? undefined : firstRunKey(key).split(':').at(-1);
  return period !== undefined && (isIsoDate(period) || ISO_WEEK.test(period)) ? period : null;
}

/** The ISO week `scheduleKey` named for a weekly job, through any retries; null for a key the scheduler did not write. */
export function scheduledWeek(key: string | null): string | null {
  const period = scheduledPeriod(key);
  return period !== null && ISO_WEEK.test(period) ? period : null;
}

function zonedInstant(date: IsoDate, time: string, timezone: string): Instant {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const asIso = new Date(guess).toISOString() as Instant;
  const wall = Date.parse(`${businessDate(asIso, timezone)}T${wallTime(asIso, timezone)}:00Z`);
  return new Date(guess - (wall - guess)).toISOString() as Instant;
}

/**
 * Today's jobs whose time has come and that no job holds the key of yet, earliest first, so a worker that starts late
 * queues them in the order their dependencies need (AGENT.md §3). Only today is backfilled, so a weekly job whose day
 * a stopped worker missed waits for the next week.
 */
export function planScheduledJobs(
  schedule: readonly ScheduledJob[],
  at: { readonly householdIds: readonly string[]; readonly now: Instant; readonly timezone: string; readonly existingKeys: ReadonlySet<string> },
): PlannedJob[] {
  const today = businessDate(at.now, at.timezone);
  return schedule
    .filter((job) => job.weekday === undefined || job.weekday === weekday(today))
    .map((job) => ({ job, runAfter: zonedInstant(today, job.at, at.timezone) }))
    .filter(({ runAfter }) => runAfter <= at.now)
    .toSorted((a, b) => a.runAfter.localeCompare(b.runAfter))
    .flatMap(({ job, runAfter }) => at.householdIds.map((householdId) => ({ kind: job.kind, householdId, idempotencyKey: scheduleKey(job, householdId, today), runAfter })))
    .filter((job) => !at.existingKeys.has(job.idempotencyKey));
}
