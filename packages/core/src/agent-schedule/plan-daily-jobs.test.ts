import { describe, expect, it } from 'vitest';
import { parseInstant } from '../clock/resolve';
import { planDailyJobs, type DailyJob } from './plan-daily-jobs';

const SCHEDULE: DailyJob[] = [
  { kind: 'morning_brief', daily: '07:00' },
  { kind: 'research_scan', daily: '06:00' },
  { kind: 'portfolio_watch', daily: '06:40' },
];
const TZ = 'Asia/Ho_Chi_Minh';
const plan = (now: string, existingKeys: readonly string[] = [], householdIds = ['h1']) =>
  planDailyJobs(SCHEDULE, { householdIds, now: parseInstant(now), timezone: TZ, existingKeys: new Set(existingKeys) });

describe('planDailyJobs', () => {
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
});
