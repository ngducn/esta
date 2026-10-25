import { describe, expect, it } from 'vitest';
import { parseInstant } from '../clock/resolve';
import { firstRunKey, planScheduledJobs, scheduledWeek, type ScheduledJob } from './plan-jobs';

const SCHEDULE: ScheduledJob[] = [
  { kind: 'morning_brief', at: '07:00' },
  { kind: 'research_scan', at: '06:00' },
  { kind: 'portfolio_watch', at: '06:40' },
];
const WEEKLY: ScheduledJob = { kind: 'weekly_review', at: '08:00', weekday: 0 };
const TZ = 'Asia/Ho_Chi_Minh';
const plan = (now: string, existingKeys: readonly string[] = [], householdIds = ['h1']) =>
  planScheduledJobs(SCHEDULE, { householdIds, now: parseInstant(now), timezone: TZ, existingKeys: new Set(existingKeys) });

describe('planScheduledJobs', () => {
  it('queues nothing before the first time of the day', () => {
    expect(plan('2026-10-07T05:59:00+07:00')).toEqual([]);
  });

  it('queues a job at its time, keyed by kind, household and business date, to run from that time', () => {
    expect(plan('2026-10-07T06:40:00+07:00', ['research_scan:h1:2026-10-07'])).toEqual([
      { kind: 'portfolio_watch', householdId: 'h1', idempotencyKey: 'portfolio_watch:h1:2026-10-07', runAfter: '2026-10-06T23:40:00.000Z' },
    ]);
  });

  it('backfills a late start at 07:30 in schedule order, every household per kind', () => {
    expect(plan('2026-10-07T07:30:00+07:00', [], ['h1', 'h2']).map((job) => job.idempotencyKey)).toEqual([
      'research_scan:h1:2026-10-07',
      'research_scan:h2:2026-10-07',
      'portfolio_watch:h1:2026-10-07',
      'portfolio_watch:h2:2026-10-07',
      'morning_brief:h1:2026-10-07',
      'morning_brief:h2:2026-10-07',
    ]);
  });

  it('queues nothing new after a restart once the day\'s jobs exist', () => {
    const existing = plan('2026-10-07T07:30:00+07:00').map((job) => job.idempotencyKey);
    expect(plan('2026-10-07T09:00:00+07:00', existing)).toEqual([]);
  });

  it('on a new day queues only that day, never the day it missed', () => {
    const keys = plan('2026-10-08T07:30:00+07:00', ['portfolio_watch:h1:2026-10-07']).map((job) => job.idempotencyKey);
    expect(keys).toEqual(['research_scan:h1:2026-10-08', 'portfolio_watch:h1:2026-10-08', 'morning_brief:h1:2026-10-08']);
  });

  it('reads the business date, not the UTC date, just after local midnight', () => {
    expect(plan('2026-10-08T00:30:00+07:00')).toEqual([]);
    expect(plan('2026-10-07T23:59:00+07:00').map((job) => job.idempotencyKey)).toContain('portfolio_watch:h1:2026-10-07');
  });

  const weekly = (now: string, existingKeys: readonly string[] = []) =>
    planScheduledJobs([WEEKLY], { householdIds: ['h1'], now: parseInstant(now), timezone: TZ, existingKeys: new Set(existingKeys) }).map((job) => job.idempotencyKey);

  it('queues a weekly job on its day from its time, keyed by ISO week', () => {
    expect(weekly('2026-10-11T07:59:00+07:00')).toEqual([]);
    expect(weekly('2026-10-11T08:05:00+07:00')).toEqual(['weekly_review:h1:2026-W41']);
  });

  it('queues a weekly job on no other day, and once its week holds the key, not again that week', () => {
    expect(weekly('2026-10-10T09:00:00+07:00'), 'Saturday').toEqual([]);
    expect(weekly('2026-10-12T09:00:00+07:00'), 'Monday after a missed Sunday').toEqual([]);
    expect(weekly('2026-10-11T23:00:00+07:00', ['weekly_review:h1:2026-W41'])).toEqual([]);
    expect(weekly('2026-10-18T08:00:00+07:00', ['weekly_review:h1:2026-W41'])).toEqual(['weekly_review:h1:2026-W42']);
  });
});

describe('scheduledWeek', () => {
  it('reads the week the scheduler keyed a weekly job by, through any Thử lại', () => {
    expect(scheduledWeek('weekly_review:h1:2026-W42')).toBe('2026-W42');
    expect(scheduledWeek('weekly_review:h1:2026-W42:retry:2')).toBe('2026-W42');
    expect(firstRunKey('weekly_review:h1:2026-W42:retry:2')).toBe('weekly_review:h1:2026-W42');
  });

  it('names no week for a key the scheduler did not write', () => {
    expect(scheduledWeek(null)).toBeNull();
    expect(scheduledWeek('weekly_review:0b6f-job-id:retry:1')).toBeNull();
    expect(scheduledWeek('morning_brief:h1:2026-10-11')).toBeNull();
  });
});
