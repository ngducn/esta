import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalizer } from '../replay/canonicalize';
import { DEFAULT_REPLAY_DIR, MissingRecordingError } from '../replay/store';
import { judgeResult } from '../sdk/result';
import { replaySession, type SessionRequest } from '../sdk/session';
import { fakeDb } from '../test/fake-db';
import { PING_PROMPT, pingTools } from './ping';
import { JOBS } from './registry';

const HOUSEHOLD = 'aaaaaaaa-0000-5000-8000-000000000004';
const OTHER = 'bbbbbbbb-0000-5000-8000-000000000007';
const emptyDir = mkdtempSync(join(tmpdir(), 'esta-replay-empty-'));
afterAll(() => rmSync(emptyDir, { recursive: true, force: true }));

function pingRequest(householdName: string): SessionRequest {
  const db = fakeDb({
    households: [
      { id: HOUSEHOLD, name: householdName, locale: 'vi' },
      { id: OTHER, name: 'Gia đình Demo 7', locale: 'vi' },
    ],
    household_members: [{ id: 'm1', household_id: HOUSEHOLD }],
    properties: [],
  });
  return {
    spec: JOBS.ping,
    prompt: PING_PROMPT,
    jobDir: emptyDir,
    configDir: emptyDir,
    tools: pingTools(db, HOUSEHOLD),
    canon: canonicalizer({ householdName }),
  };
}

describe('ping golden test, replay mode (AGENT.md §7)', () => {
  it.each(['Gia đình Demo', 'Gia đình Demo 4', 'Gia đình Demo 10'])('replies naming %s after one household_info call', async (name) => {
    const run = await replaySession(pingRequest(name), DEFAULT_REPLAY_DIR);
    const outcome = judgeResult(run.result);
    expect(outcome.ok && outcome.reply).toContain(`"${name}"`);
    expect(outcome.ok && outcome.reply).not.toContain('<household>');
    expect(run.toolCalls.map((call) => call.name)).toEqual(['mcp__esta__household_info']);
    expect(run.result).toMatchObject({ costUsd: 0, sessionId: expect.stringMatching(/^replay-[0-9a-f]{16}$/), numTurns: 2 });
  });

  it('fails with MissingRecordingError when the replay directory is empty', async () => {
    await expect(replaySession(pingRequest('Gia đình Demo 5'), emptyDir)).rejects.toThrow(MissingRecordingError);
  });

  it('keeps the ping prompt free of dates, ids and names', () => {
    const prompt = PING_PROMPT;
    expect(prompt).not.toMatch(/\d/);
    expect(prompt).not.toContain('Gia đình');
  });
});
