import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkPhase, flakyTests, markdownSection, MOM_TEST, PHASE_CHECKS, S1_RECORD, shownMarkdown, STATUS, uncited, verifyMomTest, verifyPingRecord, verifyVietQrScan, type PhaseCheck } from './phase-exit.ts';

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

  it('lists the tax examples, the seed checksum, seed coverage, the report invariants, RLS, integration and north-star for phase 4', () => {
    expect(PHASE_CHECKS['4']?.map((check) => check.id)).toEqual(['FIN-3', 'FND-7', 'Seed', 'FIN-4', 'RLS', 'IT', 'North-star']);
  });

  it('resets before every phase 4 row that reads the seed, checks both variants twice and ends with north-star', () => {
    const commands = Object.fromEntries((PHASE_CHECKS['4'] ?? []).map((check) => [check.id, 'commands' in check ? check.commands.map((command) => command.join(' ')) : []]));
    expect(commands['FIN-3']).toEqual(['pnpm --filter @esta/core exec vitest run src/tax/position.test.ts']);
    expect(commands['FND-7']).toEqual(['pnpm db:seed:check --variant northstar', 'pnpm db:seed:check']);
    expect(commands['Seed']).toEqual(['pnpm seed:coverage', 'pnpm db:reset', 'pnpm seed:coverage --database', 'pnpm seed:facts']);
    expect(commands['FIN-4']?.slice(1)).toEqual(['pnpm db:reset', 'node scripts/web-integration.ts src/server/reports/snapshot.integration.test.ts']);
    expect(commands['IT']).toEqual(['pnpm db:reset', 'node scripts/web-integration.ts']);
    expect(commands['North-star']).toEqual(['pnpm e2e:northstar --retries=1 --reporter=list']);
    const ids = (PHASE_CHECKS['4'] ?? []).map((check) => check.id);
    expect(ids.slice(-2)).toEqual(['IT', 'North-star']);
  });

  it('runs the lease prefill spec P3-19 brings for DOC-6', () => {
    const prefill = (PHASE_CHECKS['3'] ?? []).find((check) => check.id === 'DOC-6');
    expect(prefill && 'cites' in prefill && prefill.cites).toEqual(['e2e/lease-from-contract.spec.ts']);
  });

  it('runs only files that cite their row id, at least one per row', () => {
    const rows = [...(PHASE_CHECKS['1'] ?? []), ...(PHASE_CHECKS['2'] ?? []), ...(PHASE_CHECKS['3'] ?? []).filter((check) => check.id !== 'DOC-6'), ...(PHASE_CHECKS['4'] ?? [])];
    for (const check of rows) {
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

// Fixture text only: the live STATUS.md and mom-test.md change when Ryan records the gates, and `pnpm phase:check 3` reads them.
const status = (decided: string, waiting = '') =>
  ['# Status', '', '## Decided by Ryan', '', decided, '', '## Waiting for Ryan', '', waiting, '', '## Needs professional confirmation', ''].join('\n');

describe('verifyVietQrScan', () => {
  it('passes the one line Ryan adds under Decided by Ryan', () => {
    expect(verifyVietQrScan(status('- VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank.'))).toEqual({ pass: true, detail: 'VCB Digibank and MB Bank on 2026-10-22' });
    expect(verifyVietQrScan(status('- VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank')).pass).toBe(true);
  });

  it('waits while the line is only the instruction, under Waiting for Ryan', () => {
    const instruction = 'Record only the app names, by adding this line under Decided by Ryan: `- VietQR gate passed on YYYY-MM-DD: <first app>, <second app>.`';
    expect(verifyVietQrScan(status('- Earlier decision.', `- ${instruction}\n- VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank.`))).toEqual({
      pass: false,
      detail: `waiting for Ryan: no "VietQR gate passed on" line under Decided by Ryan in ${STATUS}`,
    });
  });

  it.each([
    ['inside a code fence', '```\n- VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank.\n```'],
    ['inside a tilde fence', '~~~md\n- VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank.\n~~~'],
    ['inside an HTML comment', '<!--\n- VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank.\n-->'],
    ['inside a one-line HTML comment', '<!-- - VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank. -->'],
  ])('does not read a line %s', (_, decided) => {
    expect(verifyVietQrScan(status(decided)).detail).toContain('waiting for Ryan');
  });

  it.each([
    ['the same app twice', '2026-10-22: VCB Digibank, VCB Digibank.', 'the two apps are the same'],
    ['one app in two cases', '2026-10-22: MB Bank, mb bank.', 'the two apps are the same'],
    ['one app with its spaces moved', '2026-10-22: MB Bank, MBBank.', 'the two apps are the same'],
    ['the template left in', '2026-10-22: <first app>, <second app>.', 'the first app is not named, the second app is not named'],
    ['the date left as the template', 'YYYY-MM-DD: VCB Digibank, MB Bank.', 'YYYY-MM-DD is not a date from 2026 on'],
    ['a month that does not exist', '2026-13-45: VCB Digibank, MB Bank.', '2026-13-45 is not a date from 2026 on'],
    ['a day the month does not have', '2026-02-30: VCB Digibank, MB Bank.', '2026-02-30 is not a date from 2026 on'],
    ['the zero date', '0000-00-00: VCB Digibank, MB Bank.', '0000-00-00 is not a date from 2026 on'],
    ['two blank apps', '2026-10-22: , .', 'the first app is not named, the second app is not named'],
    ['a blank second app', '2026-10-22: VCB Digibank, .', 'the second app is not named'],
  ])('fails %s', (_, rest, problem) => {
    expect(verifyVietQrScan(status(`- VietQR gate passed on ${rest}`))).toEqual({ pass: false, detail: `the VietQR line in ${STATUS}: ${problem}` });
  });

  it.each([
    ['a space after the closing dot', 'MB Bank, MB Bank. ', 'the two apps are the same'],
    ['a blank second app and a space after the dot', 'Vietcombank, . ', 'the second app is not named'],
    ['a zero-width space inside one name', 'MB\u200BBank, MBBank.', 'the two apps are the same'],
    ['one name in NFC and again in NFD', `${'Ngân hàng Số'.normalize('NFC')}, ${'Ngân hàng Số'.normalize('NFD')}.`, 'the two apps are the same'],
    ['a dot for the second app', 'Vietcombank, ..', 'the second app is not named'],
    ['two dots for the second app', 'Vietcombank, ...', 'the second app is not named'],
    ['a dash for the first app', '-, Vietcombank.', 'the first app is not named'],
    ['a question mark for the second app', 'Vietcombank, ?.', 'the second app is not named'],
  ])('fails %s', (_, apps, problem) => {
    expect(verifyVietQrScan(status(`- VietQR gate passed on 2026-10-25: ${apps}`))).toEqual({ pass: false, detail: `the VietQR line in ${STATUS}: ${problem}` });
  });

  it.each([
    ['one app in two cases', 'MB Bank, mb bank.', 'the two apps are the same'],
    ['a blank second app', 'Vietcombank, .', 'the second app is not named'],
  ])('fails %s with Windows line endings', (_, apps, problem) => {
    const crlf = status(`- VietQR gate passed on 2026-10-25: ${apps}`).replace(/\n/g, '\r\n');
    expect(verifyVietQrScan(crlf)).toEqual({ pass: false, detail: `the VietQR line in ${STATUS}: ${problem}` });
  });

  it('passes a Vietnamese app name, a trailing space and Windows line endings on a valid line', () => {
    expect(verifyVietQrScan(status('- VietQR gate passed on 2026-10-25: Ngân hàng Số, MB Bank. '))).toEqual({ pass: true, detail: 'Ngân hàng Số and MB Bank on 2026-10-25' });
    const crlf = status('- VietQR gate passed on 2026-10-25: VCB Digibank, MB Bank.').replace(/\n/g, '\r\n');
    expect(verifyVietQrScan(crlf)).toEqual({ pass: true, detail: 'VCB Digibank and MB Bank on 2026-10-25' });
  });

  it('fails one app, and two lines', () => {
    expect(verifyVietQrScan(status('- VietQR gate passed on 2026-10-22: VCB Digibank.')).detail).toContain('names no date and two apps');
    expect(verifyVietQrScan(status('- VietQR gate passed on 2026-10-22: VCB Digibank, MB Bank.\n- VietQR gate passed on 2026-10-23: VCB Digibank, MB Bank.')).detail).toContain('2 "VietQR gate passed on" lines');
  });
});

describe('verifyMomTest', () => {
  const PASSING = [['0:41', 'yes'], ['0:12', 'yes'], ['1:05', 'Yes'], ['1:59', 'yes']] as const;
  const table = (rows: readonly (readonly [string, string])[]) => ['| Task | Time | Passed | Notes |', '| --- | --- | --- | --- |', ...rows.map(([time, passed], i) => `| ${i + 1}. Task | ${time} | ${passed} | |`)];
  const file = (results: readonly string[]) =>
    ['## The four tasks', '', '| 1. Record a cash payment for Phòng 3 | "Mẹ ghi nhận" | toast |', '', '## Results', '', ...results, '', '## Failures', ''].join('\n');

  it('passes four tasks marked yes, each under two minutes, and reads only the results table', () => {
    expect(verifyMomTest(file(table(PASSING)))).toEqual({ pass: true, detail: '4 of 4 tasks passed in under two minutes' });
  });

  it('waits on the table as committed, with no times', () => {
    expect(verifyMomTest(file(table([['', ''], ['', ''], ['', ''], ['', '']])))).toEqual({
      pass: false,
      detail: `waiting for Ryan: task 1 has no time, task 2 has no time, task 3 has no time, task 4 has no time in ${MOM_TEST}`,
    });
  });

  it('fails a task at two minutes, one not passed and one not run, and names each', () => {
    expect(verifyMomTest(file(table([['2:00', 'yes'], ['0:30', 'no'], ['', '']])))).toEqual({
      pass: false,
      detail: `waiting for Ryan: task 1 took 2:00, task 2 is not marked passed, task 3 has no time, task 4 has no row in ${MOM_TEST}`,
    });
  });

  it.each([
    ['0:00', 'task 1 took 0:00'],
    ['12:30', 'task 1 took 12:30'],
    ['1:75', 'task 1 has no time'],
    ['90', 'task 1 has no time'],
  ])('fails a time of %s', (time, problem) => {
    expect(verifyMomTest(file(table([[time, 'yes'], ...PASSING.slice(1)])))).toEqual({ pass: false, detail: `waiting for Ryan: ${problem} in ${MOM_TEST}` });
  });

  it('fails a task recorded twice, even when both rows pass', () => {
    const rows = table(PASSING);
    expect(verifyMomTest(file([...rows, '| 2. Task again | 0:20 | yes | |']))).toEqual({ pass: false, detail: `waiting for Ryan: task 2 has 2 rows in ${MOM_TEST}` });
  });

  it.each([
    ['an HTML comment', (rows: string[]) => ['<!--', ...rows, '-->']],
    ['a code fence', (rows: string[]) => ['```', ...rows, '```']],
  ])('does not read rows inside %s', (_, wrap) => {
    expect(verifyMomTest(file(wrap(table(PASSING))))).toEqual({
      pass: false,
      detail: `waiting for Ryan: task 1 has no row, task 2 has no row, task 3 has no row, task 4 has no row in ${MOM_TEST}`,
    });
  });
});

describe('shownMarkdown and markdownSection', () => {
  it('drop comments and fences, and find a section by its whole heading', () => {
    const text = ['## Results', 'kept', '<!-- gone -->', '````', '```', 'gone', '````', 'kept too', '## Results later', 'other'].join('\n');
    expect(markdownSection(text, 'Results')).toBe('kept\n\nkept too\n');
    expect(shownMarkdown('a<!-- open comment\nnever closed')).toBe('a');
  });
});
