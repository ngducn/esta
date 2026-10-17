import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkPhase, PHASE_CHECKS, S1_RECORD, uncited, verifyPingRecord, type PhaseCheck } from './phase-exit.ts';

const repoRoot = join(import.meta.dirname, '..');
const logDir = mkdtempSync(join(tmpdir(), 'esta-phase-test-'));
afterAll(() => rmSync(logDir, { recursive: true, force: true }));

const node = (code: string) => [process.execPath, '-e', code];

function runPhase(phase: string, checks: Record<string, readonly PhaseCheck[]>) {
  const lines: string[] = [];
  const code = checkPhase(phase, { repoRoot, checks, logDir, print: (line) => lines.push(line) });
  return { code, lines };
}

const live = {
  source: 'pnpm agent:record, P0-15',
  job: 'ping',
  auth_mode: 'subscription',
  agent_mode: 'live',
  model: 'claude-sonnet-5-5',
  num_turns: 2,
  cost_estimate_usd: 0.0062,
  tool_calls: { mcp__esta__household_info: 1 },
};

describe('checkPhase', () => {
  it('prints PASS for each passing row and exits 0', () => {
    const { code, lines } = runPhase('9', { '9': [{ id: 'A', commands: [node('process.exit(0)')] }] });
    expect(code).toBe(0);
    expect(lines).toEqual([expect.stringMatching(/^PASS {2}A /)]);
  });

  it('prints FAIL for a failing command, runs the rows after it and exits 1', () => {
    const { code, lines } = runPhase('9', {
      '9': [
        { id: 'A', commands: [node('process.exit(0)'), node('process.exit(3)')] },
        { id: 'B', commands: [node('process.exit(0)')] },
      ],
    });
    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(/^FAIL {2}A .* failed, log /), expect.stringMatching(/^PASS {2}B /)]);
  });

  it('fails a record row whose file is missing instead of crashing', () => {
    const { code, lines } = runPhase('9', { '9': [{ id: 'S1', verify: () => verifyPingRecord(readFileSync(join(logDir, 'missing.json'), 'utf8')) }] });
    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(/^FAIL {2}S1 .*ENOENT/)]);
  });

  it('refuses an unknown phase', () => {
    const { code, lines } = runPhase('7', { '0': [] });
    expect(code).toBe(2);
    expect(lines).toEqual(['Unknown phase "7". Known phases: 0.']);
  });

  it('lists FND-1 to FND-7, FND-9 and S1 for phase 0', () => {
    expect(PHASE_CHECKS['0']?.map((check) => check.id)).toEqual(['FND-1', 'FND-2', 'FND-3', 'FND-4', 'FND-5', 'FND-6', 'FND-7', 'FND-9', 'S1']);
  });

  it('lists PRP-1 to PRP-6, PRP-8, RLS and Lighthouse for phase 1, with PRP-7 left to Phase 2', () => {
    expect(PHASE_CHECKS['1']?.map((check) => check.id)).toEqual(['PRP-1', 'PRP-2', 'PRP-3', 'PRP-4', 'PRP-5', 'PRP-6', 'PRP-8', 'RLS', 'Lighthouse']);
  });

  it('runs only files that cite their row id, at least one per row', () => {
    for (const check of PHASE_CHECKS['1'] ?? []) {
      if (!('commands' in check) || check.cites === undefined) continue;
      expect(check.cites.length, check.id).toBeGreaterThan(0);
      expect(uncited(repoRoot, check), check.id).toEqual([]);
    }
  });

  it('fails a row whose file does not cite its id, or is missing, without running it', () => {
    const { code, lines } = runPhase('9', {
      '9': [
        { id: 'PRP-2', cites: ['scripts/slot.ts'], commands: [node('process.exit(0)')] },
        { id: 'PRP-9', cites: ['e2e/missing.spec.ts'], commands: [node('process.exit(0)')] },
      ],
    });
    expect(code).toBe(1);
    expect(lines).toEqual([
      expect.stringMatching(/^FAIL {2}PRP-2 .*scripts\/slot\.ts never names PRP-2$/),
      expect.stringMatching(/^FAIL {2}PRP-9 .*e2e\/missing\.spec\.ts never names PRP-9$/),
    ]);
  });

  it('exits 1 when one phase 1 row fails', () => {
    const rows = (PHASE_CHECKS['1'] ?? []).map((check, index): PhaseCheck => ({ id: check.id, commands: [node(`process.exit(${index === 7 ? 1 : 0})`)] }));
    const { code, lines } = runPhase('1', { '1': rows });
    expect(code).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL'))).toEqual([expect.stringMatching(/^FAIL {2}RLS /)]);
  });
});

describe('verifyPingRecord', () => {
  it('passes a live ping on subscription auth with one household_info call', () => {
    expect(verifyPingRecord(JSON.stringify(live)).pass).toBe(true);
  });

  it('passes the committed S1 record', () => {
    expect(verifyPingRecord(readFileSync(join(repoRoot, S1_RECORD), 'utf8'))).toEqual({
      pass: true,
      detail: 'auth subscription, agent live, household_info × 1',
    });
  });

  it.each([
    ['api_key auth', { ...live, auth_mode: 'api_key' }],
    ['a replay run', { ...live, agent_mode: 'replay' }],
    ['no household_info call', { ...live, tool_calls: {} }],
    ['two household_info calls', { ...live, tool_calls: { mcp__esta__household_info: 2 } }],
  ])('fails %s', (_, record) => {
    expect(verifyPingRecord(JSON.stringify(record)).pass).toBe(false);
  });

  it('fails a record that carries a session id or a token', () => {
    expect(verifyPingRecord(JSON.stringify({ ...live, session_id: 'abc' }))).toMatchObject({ pass: false, detail: expect.stringContaining('session_id') });
    expect(verifyPingRecord(JSON.stringify({ ...live, token: 'x' })).pass).toBe(false);
  });

  it('fails text that is not JSON', () => {
    expect(verifyPingRecord('not json').pass).toBe(false);
  });
});
