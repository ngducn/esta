import { clockAt, parseInstant } from '@esta/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CronClient } from './supabase';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[], insertError: null as { message: string } | null }));
vi.mock('../env', () => ({ env: { CRON_SECRET: 'secret' } }));
vi.mock('../clock', () => ({ readGlobalClock: () => Promise.resolve(clockAt({ kind: 'table', now: parseInstant('2026-11-06T17:30:00Z') }, 'Asia/Ho_Chi_Minh')) }));
vi.mock('./supabase', () => ({
  cronClient: () =>
    ({
      from: (table: string) => ({
        insert: (row: Record<string, unknown>) => {
          expect(table).toBe('cron_runs');
          state.inserted.push(row);
          return Promise.resolve({ error: state.insertError });
        },
      }),
    }) as unknown as CronClient,
}));
const { cronHandler } = await import('./handler');

const call = (handler: (request: Request) => Promise<Response>, auth = 'Bearer secret') => handler(new Request('http://localhost/api/cron/x', { headers: { authorization: auth } }));

beforeEach(() => {
  state.inserted = [];
  state.insertError = null;
});

describe('cronHandler records every run', () => {
  it('writes an ok row with the clock times and the households processed', async () => {
    const response = await call(cronHandler('invoices', () => Promise.resolve({ ok: true, households: 3 })));
    expect(response.status).toBe(200);
    expect(state.inserted).toEqual([
      { job: 'invoices', started_at: '2026-11-06T17:30:00.000Z', finished_at: '2026-11-06T17:30:00.000Z', ok: true, failure: null, households_processed: 3, households_failed: 0 },
    ]);
  });

  it('writes a failed row and answers 500 when households failed, without their error text', async () => {
    const failed = [{ household_id: 'h1', error: 'duplicate key value (Nguyen Van Demo)' }];
    const response = await call(cronHandler('invoices', () => Promise.resolve({ ok: false, households: 3, failed })));
    expect(response.status).toBe(500);
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({ ok: false, failure: '1 households failed', households_processed: 2, households_failed: 1 });
    expect(JSON.stringify(state.inserted)).not.toContain('Nguyen');
  });

  it('writes a failed row for a job that throws, with the error class and not its message, then rethrows', async () => {
    const handler = cronHandler('lease_status', () => Promise.reject(new TypeError('Key (full_name)=(Nguyen Van Demo) is bad')));
    await expect(call(handler)).rejects.toThrow('is bad');
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({ job: 'lease_status', ok: false, failure: 'threw TypeError' });
    expect(JSON.stringify(state.inserted)).not.toContain('Nguyen');
  });

  it('writes nothing for a call without the secret', async () => {
    const response = await call(cronHandler('keep_alive', () => Promise.resolve({ ok: true })), 'Bearer wrong');
    expect(response.status).toBe(401);
    expect(state.inserted).toEqual([]);
  });

  it('still answers with the job result when the row cannot be written', async () => {
    state.insertError = { message: 'down' };
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await call(cronHandler('keep_alive', () => Promise.resolve({ ok: true })));
    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('keep_alive'));
    log.mockRestore();
  });
});
