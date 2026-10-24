import { isoDate, parseInstant, type Clock } from '@esta/core';
import { describe, expect, it } from 'vitest';
import { beat } from './heartbeat';
import { DAILY_JOBS, jobSpec, JOBS } from './jobs/registry';
import { fakeDb, type Recorded } from './test/fake-db';
import { pingTools } from './jobs/ping';
import { isEstaToolName } from './tools/server';

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

  it('defines extract_document with Read, save_extraction, 8 turns and 5 minutes', () => {
    expect(JOBS.extract_document).toMatchObject({ builtInTools: ['Read'], mcpTools: ['save_extraction'], maxTurns: 8, timeoutMs: 300_000, modelRole: 'routine' });
  });

  it('defines portfolio_watch with watch_facts and create_item, 6 turns, 3 minutes, daily at 06:40', () => {
    expect(JOBS.portfolio_watch).toMatchObject({ builtInTools: [], mcpTools: ['watch_facts', 'create_item'], maxTurns: 6, timeoutMs: 180_000, schedule: { daily: '06:40' } });
  });

  it('defines morning_brief with watch_facts, recent_items and create_brief, 6 turns, 3 minutes, daily at 07:00 after its inputs', () => {
    expect(JOBS.morning_brief).toMatchObject({
      builtInTools: [],
      mcpTools: ['watch_facts', 'recent_items', 'create_brief'],
      maxTurns: 6,
      timeoutMs: 180_000,
      schedule: { daily: '07:00' },
      waitsFor: ['research_scan', 'portfolio_watch'],
    });
    expect(DAILY_JOBS).toEqual([
      { kind: 'research_scan', daily: '06:00' },
      { kind: 'portfolio_watch', daily: '06:40' },
      { kind: 'morning_brief', daily: '07:00' },
    ]);
  });

  it('defines research_scan with the web tools and its four Esta tools, 40 turns, 10 minutes, daily at 06:00', () => {
    expect(JOBS.research_scan).toMatchObject({
      builtInTools: ['WebSearch', 'WebFetch'],
      mcpTools: ['research_topics', 'list_properties', 'recent_items', 'add_research_item'],
      maxTurns: 40,
      timeoutMs: 600_000,
      schedule: { daily: '06:00' },
    });
  });

  it('knows no other kind', () => {
    expect(jobSpec('weekly_review')).toBeUndefined();
    expect(jobSpec('toString')).toBeUndefined();
  });

  it('names MCP tools as mcp__esta__<name>', () => {
    expect([...pingTools(fakeDb({}), 'h').keys()]).toEqual(['mcp__esta__household_info']);
  });
});
