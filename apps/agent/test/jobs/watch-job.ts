import { isoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import type { WatchLabels, WatchSnapshot } from '@esta/core/watch';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { portfolioWatchRequest } from '../../src/jobs/portfolio-watch';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, writeRecording } from '../../src/replay/store';
import { canonicalInput, replaySession } from '../../src/sdk/session';
import { fakeDb, type Recorded } from '../../src/test/fake-db';
import { clockOn, HOUSEHOLD, labels, snapshot } from '../full-seed';
import { toolCaller } from '../replay-worker';

export const clock = clockOn('2026-10-07T06:45:00+07:00');

export type Row = Record<string, unknown>;
export type Read = () => Promise<{ snapshot: WatchSnapshot; labels: WatchLabels }>;

/** A watch job on the full seed at 2026-10-07, or on the `read` and `asOf` given. */
export function setup(tables: Record<string, Row[]> = { agent_items: [] }, jobId = 'job-1', locale: Locale = 'vi', read: Read = async () => ({ snapshot, labels }), asOf = '2026-10-07') {
  const writes: Recorded[] = [];
  const prepared = portfolioWatchRequest({ db: fakeDb(tables, writes), householdId: HOUSEHOLD, jobId, locale, asOf: isoDate(asOf), timezone: 'Asia/Ho_Chi_Minh', clock, read });
  return { tables, writes, prepared, call: toolCaller(prepared) };
}

export const items = (tables: Record<string, Row[]>) => tables.agent_items ?? [];

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export async function replay(prepared: ReturnType<typeof setup>['prepared'], replayDir = DEFAULT_REPLAY_DIR) {
  const jobDir = mkdtempSync(join(tmpdir(), 'esta-watch-job-'));
  dirs.push(jobDir);
  return replaySession({ spec: JOBS.portfolio_watch, prompt: prepared.prompt, jobDir, configDir: jobDir, tools: prepared.tools, canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }) }, replayDir);
}

/** A recording of `toolCalls` for this prompt in a fresh directory, for the cases no committed recording covers. */
export function recordingDir(prepared: ReturnType<typeof setup>['prepared'], toolCalls: Array<{ name: string; input: Record<string, unknown> }>) {
  const dir = mkdtempSync(join(tmpdir(), 'esta-watch-replay-'));
  dirs.push(dir);
  const input = canonicalInput({ spec: JOBS.portfolio_watch, prompt: prepared.prompt, canon: canonicalizer({ householdName: 'Gia đình Demo' }) });
  writeRecording(dir, { version: 1, kind: 'portfolio_watch', inputHash: inputHash(input), input, model: 'test', numTurns: toolCalls.length + 1, toolCalls, reply: 'xong' });
  return dir;
}
