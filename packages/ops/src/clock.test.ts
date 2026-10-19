import { describe, expect, it, vi } from 'vitest';
import { readClock } from './clock';
import type { Db } from './db';

function testClockTable(rows: { frozen_now: string }[]) {
  const read = vi.fn(async () => ({ data: rows.at(-1) ?? null, error: null }));
  const db = { from: (table: string) => ({ select: () => ({ maybeSingle: table === 'test_clock' ? read : undefined }) }) } as unknown as Db;
  return { db, read };
}

const env = { ESTA_ENV: 'test', ESTA_FROZEN_NOW: undefined, ESTA_TIMEZONE: 'Asia/Ho_Chi_Minh' } as const;

describe('readClock', () => {
  it('reads the test clock row on every call, so a write between two calls moves the clock', async () => {
    const rows = [{ frozen_now: '2026-10-07T09:00:00+07:00' }];
    const { db, read } = testClockTable(rows);
    const first = await readClock(db, env);
    rows.push({ frozen_now: '2026-10-08T00:30:00+07:00' });
    const second = await readClock(db, env);
    expect(read).toHaveBeenCalledTimes(2);
    expect([first.source, first.now(), first.today()]).toEqual(['table', '2026-10-07T02:00:00.000Z', '2026-10-07']);
    expect([second.source, second.today()]).toEqual(['table', '2026-10-08']);
  });

  it('falls back to ESTA_FROZEN_NOW when the table is empty', async () => {
    const clock = await readClock(testClockTable([]).db, { ...env, ESTA_FROZEN_NOW: '2026-01-01T09:00:00+07:00' });
    expect([clock.source, clock.today()]).toEqual(['env', '2026-01-01']);
  });

  it('never reads the table in production', async () => {
    const { db, read } = testClockTable([{ frozen_now: '2026-10-07T09:00:00+07:00' }]);
    const clock = await readClock(db, { ...env, ESTA_ENV: 'production' });
    expect(read).not.toHaveBeenCalled();
    expect(clock.source).toBe('system');
  });
});
