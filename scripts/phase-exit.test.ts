import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkPhase, flakyTests, MOM_TEST, PHASE_CHECKS, S1_RECORD, STATUS, uncited, verifyMomTest, verifyPingRecord, verifyVietQrScan, type PhaseCheck } from './phase-exit.ts';

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

  it('lists DOC-1 to DOC-7, PRP-7, AGT-2, RLS, north-star and Lighthouse for phase 2, Lighthouse last', () => {
    expect(PHASE_CHECKS['2']?.map((check) => check.id)).toEqual(['DOC-1', 'DOC-2', 'DOC-3', 'DOC-4', 'DOC-5', 'DOC-6', 'DOC-7', 'PRP-7', 'AGT-2', 'RLS', 'North-star', 'Lighthouse']);
  });

  it('runs the phase 2 Lighthouse budgets, the replay golden suite and the north-star steps', () => {
    const commands = Object.fromEntries((PHASE_CHECKS['2'] ?? []).map((check) => [check.id, 'commands' in check ? check.commands.map((command) => command.join(' ')) : []]));
    expect(commands['Lighthouse'], 'back to the full seed after the north-star seed').toEqual(['pnpm db:reset', 'node scripts/perf/phase-budget.ts --phase 2']);
    expect(commands['AGT-2']?.[0]).toContain('test/golden/extract.test.ts');
    expect(commands['North-star']).toEqual(['pnpm e2e:northstar --retries=1 --reporter=list']);
  });

  it('exits 1 when one phase 2 row fails', () => {
    const rows = (PHASE_CHECKS['2'] ?? []).map((check): PhaseCheck => ({ id: check.id, commands: [node(`process.exit(${check.id === 'AGT-2' ? 1 : 0})`)] }));
    const { code, lines } = runPhase('2', { '2': rows });
    expect(code).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL'))).toEqual([expect.stringMatching(/^FAIL {2}AGT-2 /)]);
    expect(lines.filter((line) => line.startsWith('PASS'))).toHaveLength(11);
  });

  it('lists LSE-1 to LSE-11, the lease prefill, FND-8, the property tests, RLS, integration, north-star, Lighthouse and the two gates for phase 3', () => {
    expect(PHASE_CHECKS['3']?.map((check) => check.id)).toEqual([
      ...Array.from({ length: 11 }, (_, i) => `LSE-${i + 1}`),
      'DOC-6',
      'FND-8',
      'PBT',
      'RLS',
      'IT',
      'North-star',
      'Lighthouse',
      'VietQR',
      'Mom',
    ]);
  });

  it('resets before the integration tests, whose cron test moves the seed, and runs north-star right after them', () => {
    const commands = Object.fromEntries((PHASE_CHECKS['3'] ?? []).map((check) => [check.id, 'commands' in check ? check.commands.map((command) => command.join(' ')) : []]));
    expect(commands['IT']).toEqual(['pnpm db:reset', 'node scripts/web-integration.ts']);
    const ids = (PHASE_CHECKS['3'] ?? []).map((check) => check.id);
    expect(ids.indexOf('North-star')).toBe(ids.indexOf('IT') + 1);
    expect(commands['Lighthouse']).toEqual(['pnpm db:reset', 'node scripts/perf/phase-budget.ts --phase 3']);
  });

  it('fails the lease prefill row until P3-19 brings its spec', () => {
    const prefill = (PHASE_CHECKS['3'] ?? []).find((check) => check.id === 'DOC-6');
    expect(prefill && uncited(repoRoot, prefill)).toEqual(['e2e/lease-from-contract.spec.ts']);
  });

  it('waits for Ryan on the committed VietQR and Mom test records', () => {
    expect(verifyVietQrScan(readFileSync(join(repoRoot, STATUS), 'utf8'))).toMatchObject({ pass: false, detail: expect.stringContaining('waiting for Ryan') });
    expect(verifyMomTest(readFileSync(join(repoRoot, MOM_TEST), 'utf8'))).toEqual({
      pass: false,
      detail: `waiting for Ryan: task 1 has no time, task 2 has no time, task 3 has no time, task 4 has no time in ${MOM_TEST}`,
    });
  });

  it('runs only files that cite their row id, at least one per row', () => {
    for (const check of [...(PHASE_CHECKS['1'] ?? []), ...(PHASE_CHECKS['2'] ?? []), ...(PHASE_CHECKS['3'] ?? []).filter((check) => check.id !== 'DOC-6')]) {
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

  it('runs every phase 1, 2 and 3 spec with one retry, as local CI does', () => {
    const specCommands = [...(PHASE_CHECKS['1'] ?? []), ...(PHASE_CHECKS['2'] ?? []), ...(PHASE_CHECKS['3'] ?? [])].flatMap((check) => ('commands' in check ? check.commands : [])).filter((command) => command[1]?.startsWith('e2e') === true);
    expect(specCommands.length).toBeGreaterThan(0);
    for (const command of specCommands) expect(command, command.join(' ')).toEqual(expect.arrayContaining(['--retries=1', '--reporter=list']));
  });

  it('passes a row whose test needed its retry and names that test as flaky', () => {
    const epilogue = '  1 flaky\n    [mobile] › e2e/a.spec.ts:3:1 › opens the page\n  4 passed (9.1s)\n';
    const { code, lines } = runPhase('9', { '9': [{ id: 'A', commands: [node(`process.stdout.write(${JSON.stringify(epilogue)})`)] }] });
    expect(code).toBe(0);
    expect(lines).toEqual([expect.stringMatching(/^PASS {2}A /), '       flaky  [mobile] › e2e/a.spec.ts:3:1 › opens the page']);
  });

  it('fails a row whose test failed on its retry too', () => {
    const epilogue = '  1 failed\n    [mobile] › e2e/a.spec.ts:3:1 › opens the page\n';
    const { code, lines } = runPhase('9', { '9': [{ id: 'A', commands: [node(`process.stdout.write(${JSON.stringify(epilogue)}); process.exit(1)`)] }] });
    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(/^FAIL {2}A /)]);
  });

  it('exits 1 when one phase 1 row fails', () => {
    const rows = (PHASE_CHECKS['1'] ?? []).map((check, index): PhaseCheck => ({ id: check.id, commands: [node(`process.exit(${index === 7 ? 1 : 0})`)] }));
    const { code, lines } = runPhase('1', { '1': rows });
    expect(code).toBe(1);
    expect(lines.filter((line) => line.startsWith('FAIL'))).toEqual([expect.stringMatching(/^FAIL {2}RLS /)]);
  });
});

describe('flakyTests', () => {
  it('reads the titles under the flaky count and stops at the next count', () => {
    const log = ['Running 6 tests', '  1 failed', '    [mobile] › e2e/b.spec.ts:9:1 › broke', '  2 flaky', '    [mobile] › e2e/a.spec.ts:3:1 › one', '    [mobile] › e2e/a.spec.ts:20:1 › two', '  3 passed (9s)'].join('\n');
    expect(flakyTests(log)).toEqual(['[mobile] › e2e/a.spec.ts:3:1 › one', '[mobile] › e2e/a.spec.ts:20:1 › two']);
  });

  it('finds none in a clean run', () => {
    expect(flakyTests('  8 passed (30s)\n')).toEqual([]);
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

describe('verifyVietQrScan', () => {
  it('passes the line Ryan writes once two banking apps have scanned the codes', () => {
    expect(verifyVietQrScan('## Decided by Ryan\n\n- VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank.\n')).toEqual({ pass: true, detail: 'VCB Digibank and MB Bank on 2026-10-22' });
  });

  it('fails one app, or a line without a date', () => {
    expect(verifyVietQrScan('- VietQR gate passed on 2026-10-22: VCB Digibank.\n').pass).toBe(false);
    expect(verifyVietQrScan('- VietQR gate passed: VCB Digibank, MB Bank.\n').pass).toBe(false);
  });
});

describe('verifyMomTest', () => {
  const results = (rows: readonly (readonly [string, string])[]) =>
    ['## The four tasks', '', '| 1. Record a cash payment for Phòng 3 | "Mẹ ghi nhận" | toast |', '', '## Results', '', '| Task | Time | Passed | Notes |', '| --- | --- | --- | --- |', ...rows.map(([time, passed], i) => `| ${i + 1}. Task | ${time} | ${passed} | |`), '', '## Failures', ''].join('\n');

  it('passes four tasks marked yes, each under two minutes, and reads only the results table', () => {
    expect(verifyMomTest(results([['0:41', 'yes'], ['0:12', 'yes'], ['1:05', 'Yes'], ['1:59', 'yes']]))).toEqual({ pass: true, detail: '4 of 4 tasks passed in under two minutes' });
  });

  it('fails a task at two minutes, one not passed and one not run, and names each', () => {
    expect(verifyMomTest(results([['2:00', 'yes'], ['0:30', 'no'], ['', '']]))).toEqual({
      pass: false,
      detail: `waiting for Ryan: task 1 took 2:00, task 2 is not marked passed, task 3 has no time, task 4 has no row in ${MOM_TEST}`,
    });
  });
});
