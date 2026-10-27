import { clockAt, parseInstant } from '@esta/core';
import { describe, expect, it } from 'vitest';
import { scheduleJobs, SCHEDULED_PRIORITY } from './scheduler';
import { fakeDb } from './test/fake-db';

const TZ = 'Asia/Ho_Chi_Minh';
const at = (now: string) => clockAt({ kind: 'table', now: parseInstant(now) }, TZ);

describe('scheduleJobs', () => {
  it('queues portfolio_watch for every household once its time has come, behind jobs people queue', async () => {
    const tables = { households: [{ id: 'h1' }, { id: 'h2' }], agent_jobs: [] as Record<string, unknown>[] };
    const db = fakeDb(tables);
    expect(await scheduleJobs(db, at('2026-10-07T05:59:00+07:00'), TZ)).toBe(0);
    expect(await scheduleJobs(db, at('2026-10-07T06:39:00+07:00'), TZ), 'research_scan at 06:00').toBe(2);
    expect(await scheduleJobs(db, at('2026-10-07T06:45:00+07:00'), TZ)).toBe(2);
    expect(tables.agent_jobs.slice(2)).toMatchObject([
      { household_id: 'h1', kind: 'portfolio_watch', idempotency_key: 'portfolio_watch:h1:2026-10-07', run_after: '2026-10-06T23:40:00.000Z', priority: SCHEDULED_PRIORITY },
      { household_id: 'h2', kind: 'portfolio_watch', idempotency_key: 'portfolio_watch:h2:2026-10-07' },
    ]);
  });

  it('adds the brief at its own time, nothing on a later tick or a restart the same day, and the new day in schedule order', async () => {
    const tables = { households: [{ id: 'h1' }], agent_jobs: [] as Record<string, unknown>[] };
    const db = fakeDb(tables);
    await scheduleJobs(db, at('2026-10-07T06:45:00+07:00'), TZ);
    expect(await scheduleJobs(db, at('2026-10-07T09:00:00+07:00'), TZ)).toBe(1);
    expect(await scheduleJobs(db, at('2026-10-07T09:01:00+07:00'), TZ)).toBe(0);
    expect(await scheduleJobs(db, at('2026-10-08T07:30:00+07:00'), TZ)).toBe(3);
    expect(tables.agent_jobs.map((job) => job.idempotency_key)).toEqual([
      'research_scan:h1:2026-10-07',
      'portfolio_watch:h1:2026-10-07',
      'morning_brief:h1:2026-10-07',
      'research_scan:h1:2026-10-08',
      'portfolio_watch:h1:2026-10-08',
      'morning_brief:h1:2026-10-08',
    ]);
  });
});
