import { parseInstant } from '@esta/core';
import { describe, expect, it, vi } from 'vitest';
import { setTestClock } from './test-clock';

vi.mock('server-only', () => ({}));
import type { CronClient } from './supabase';

/** A fake table that records every call, so the test can see whether the global row was ever deleted. */
function fakeClient(existing: boolean) {
  const calls: string[] = [];
  const table = {
    update: () => ({ is: () => ({ select: () => Promise.resolve({ data: existing ? [{ for_household: null }] : [], error: null }) }) }),
    insert: () => {
      calls.push('insert');
      return Promise.resolve({ error: null });
    },
    delete: () => {
      calls.push('delete');
      return { is: () => Promise.resolve({ error: null }) };
    },
    upsert: vi.fn(),
  };
  return { client: { from: () => table } as unknown as CronClient, calls };
}

describe('setTestClock for the global row', () => {
  const at = parseInstant('2026-10-07T07:00:00+07:00');

  it('never deletes the row it moves, because the agent worker reads it on every beat', async () => {
    const { client, calls } = fakeClient(true);
    await setTestClock(client, at, null);
    expect(calls).toEqual([]);
  });

  it('inserts the row only when none exists', async () => {
    const { client, calls } = fakeClient(false);
    await setTestClock(client, at, null);
    expect(calls).toEqual(['insert']);
  });
});
