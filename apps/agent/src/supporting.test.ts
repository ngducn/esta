import { isoDate, parseInstant, type Clock } from '@esta/core';
import { describe, expect, it } from 'vitest';
import { readClock } from './clock';
import { beat } from './heartbeat';
import { jobSpec, JOBS } from './jobs/registry';
import { fakeDb, type Recorded } from './test/fake-db';
import { buildTools, isEstaToolName } from './tools/server';

const env = { ESTA_ENV: 'development', ESTA_FROZEN_NOW: undefined, ESTA_TIMEZONE: 'Asia/Ho_Chi_Minh' } as const;

describe('readClock', () => {
  it('reads the test clock row outside production', async () => {
    const clock = await readClock(fakeDb({ test_clock: [{ frozen_now: '2026-10-07T02:06:00+00:00' }] }), env);
    expect([clock.source, clock.now(), clock.today()]).toEqual(['table', '2026-10-07T02:06:00.000Z', '2026-10-07']);
  });

  it('ignores the test clock row in production', async () => {
    const clock = await readClock(fakeDb({ test_clock: [{ frozen_now: '2026-10-07T02:06:00+00:00' }] }), { ...env, ESTA_ENV: 'production' });
    expect(clock.source).toBe('system');
  });
});

describe('beat', () => {
  const clock: Clock = { source: 'table', now: () => parseInstant('2026-10-07T09:06:00+07:00'), today: () => isoDate('2026-10-07') };
  const info = { worker_id: '6f1c2a4e-0b7d-4f6a-9c1e-2d3b4a5c6d7e', host_label: 'mac-mini', version: '0.1.0', auth_mode: 'none', agent_mode: 'replay' } as const;

  it('upserts the worker row with the clock time, then deletes the rows of workers unseen for a day', async () => {
    const writes: Recorded[] = [];
    await beat(fakeDb({}, writes), info, clock);
    expect(writes).toEqual([
      { table: 'worker_heartbeats', op: 'upsert', row: { ...info, last_seen_at: '2026-10-07T02:06:00.000Z' } },
      { table: 'worker_heartbeats', op: 'delete', row: { last_seen_at: { lt: '2026-10-06T02:06:00.000Z' } } },
    ]);
  });
});

describe('job registry', () => {
  it('defines ping with no built-in tool, household_info, 3 turns and 1 minute', () => {
    expect(JOBS.ping).toMatchObject({ builtInTools: [], mcpTools: ['household_info'], maxTurns: 3, timeoutMs: 60_000, modelRole: 'routine' });
  });

  it('names only tools the esta server provides', () => {
    for (const spec of Object.values(JOBS)) expect(spec.mcpTools.every(isEstaToolName)).toBe(true);
  });

  it('knows no other kind', () => {
    expect(jobSpec('extract_document')).toBeUndefined();
    expect(jobSpec('toString')).toBeUndefined();
  });

  it('names MCP tools as mcp__esta__<name>', () => {
    expect([...buildTools(fakeDb({}), 'h', ['household_info']).keys()]).toEqual(['mcp__esta__household_info']);
  });
});
