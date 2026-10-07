import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { readClock } = await import('./clock');

const config = { ESTA_ENV: 'test', ESTA_FROZEN_NOW: undefined, ESTA_TIMEZONE: 'Asia/Ho_Chi_Minh' } as const;

describe('readClock', () => {
  test('two requests read two different rows after a write between them', async () => {
    let row = { frozen_now: '2026-10-07T09:00:00+07:00' };
    const readRow = vi.fn(async () => row);

    const first = await readClock(config, readRow);
    row = { frozen_now: '2026-10-08T00:30:00+07:00' };
    const second = await readClock(config, readRow);

    expect(readRow).toHaveBeenCalledTimes(2);
    expect([first.source, first.today()]).toEqual(['table', '2026-10-07']);
    expect([second.source, second.today()]).toEqual(['table', '2026-10-08']);
  });

  test('an emptied table falls back to ESTA_FROZEN_NOW on the next request', async () => {
    let row: { frozen_now: string } | null = { frozen_now: '2026-10-07T09:00:00+07:00' };
    const readRow = async () => row;
    const withEnv = { ...config, ESTA_FROZEN_NOW: '2026-01-01T09:00:00+07:00' };

    expect((await readClock(withEnv, readRow)).today()).toBe('2026-10-07');
    row = null;
    const after = await readClock(withEnv, readRow);
    expect([after.source, after.today()]).toEqual(['env', '2026-01-01']);
  });

  test('production never reads the table', async () => {
    const readRow = vi.fn(async () => ({ frozen_now: '2026-10-07T09:00:00+07:00' }));
    const clock = await readClock({ ...config, ESTA_ENV: 'production' }, readRow);
    expect(readRow).not.toHaveBeenCalled();
    expect(clock.source).toBe('system');
  });
});
