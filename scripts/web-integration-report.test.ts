import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gatewayRetryFiles, GATEWAY_ERROR, parseReport, skippedTests, stackTestFiles, type VitestReport } from './web-integration-report.ts';

const WEB = '/repo/apps/web';
const gateway = 'Reading the lease schedule failed: An invalid response was received from the upstream server';
const test = (status: string, failureMessages: string[] = []) => ({ fullName: `case ${status}`, status, failureMessages });
const file = (name: string, status: string, assertionResults: ReturnType<typeof test>[], message = '') => ({ name: `${WEB}/${name}`, status, message, assertionResults });
const report = (...testResults: VitestReport['testResults']): VitestReport => ({ testResults });

describe('skippedTests', () => {
  it('names a skipped, pending or todo test and ignores passed and failed ones', () => {
    const found = skippedTests(report(file('src/a.test.ts', 'passed', [test('passed'), test('skipped'), test('pending'), test('todo'), test('failed', ['x'])])));
    expect(found).toHaveLength(3);
  });

  it('finds the whole describe.skipIf block of a file that skipped', () => {
    expect(skippedTests(report(file('src/documents/actions.test.ts', 'skipped', [test('skipped'), test('skipped')])))).toHaveLength(2);
  });

  it('is empty when nothing skipped', () => {
    expect(skippedTests(report(file('src/a.test.ts', 'passed', [test('passed')])))).toEqual([]);
  });
});

describe('gatewayRetryFiles', () => {
  it('names the files whose only failures are the gateway error', () => {
    const r = report(file('src/a.integration.test.ts', 'failed', [test('failed', [gateway]), test('passed')]), file('src/b.integration.test.ts', 'passed', [test('passed')]));
    expect(gatewayRetryFiles(r, WEB)).toEqual(['src/a.integration.test.ts']);
  });

  it('retries a file that failed as a whole with the gateway error', () => {
    expect(gatewayRetryFiles(report(file('src/a.test.ts', 'failed', [], gateway)), WEB)).toEqual(['src/a.test.ts']);
  });

  it('retries nothing when any failure is a different one, even beside a gateway error', () => {
    const r = report(file('src/a.test.ts', 'failed', [test('failed', [gateway])]), file('src/b.test.ts', 'failed', [test('failed', ['expected 1 to be 2'])]));
    expect(gatewayRetryFiles(r, WEB)).toBeUndefined();
  });

  it('retries nothing when one file has a gateway failure and a real one', () => {
    expect(gatewayRetryFiles(report(file('src/a.test.ts', 'failed', [test('failed', [gateway]), test('failed', ['boom'])])), WEB)).toBeUndefined();
  });

  it('retries nothing when nothing failed', () => {
    expect(gatewayRetryFiles(report(file('src/a.test.ts', 'passed', [test('passed')])), WEB)).toBeUndefined();
  });

  it('matches the message the local gateway sends', () => {
    expect(GATEWAY_ERROR.test(gateway)).toBe(true);
    expect(GATEWAY_ERROR.test('permission denied for table leases')).toBe(false);
  });
});

describe('parseReport', () => {
  it('reads the JSON reporter output', () => {
    const json = JSON.stringify({ numFailedTests: 0, testResults: [{ name: 'a', status: 'passed', assertionResults: [{ fullName: 'x', status: 'passed' }] }] });
    expect(parseReport(json).testResults[0]?.assertionResults[0]?.failureMessages).toEqual([]);
  });

  it('refuses output that is not a report', () => {
    expect(() => parseReport('{}')).toThrow();
  });
});

describe('stackTestFiles', () => {
  it('finds a test that imports the stack helper and no other', () => {
    const root = mkdtempSync(join(tmpdir(), 'stack-files-'));
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(root, 'src', path)), { recursive: true });
      writeFileSync(join(root, 'src', path), text);
    };
    write('server/a/actions.test.ts', "import { stackUp } from '@/test/stack';");
    write('server/b/plain.test.ts', "import { x } from './x';");
    write('server/c/lane.integration.test.ts', "import { stackUp } from '@/test/stack';");
    write('server/d/helper.ts', "import { stackUp } from '@/test/stack';");
    expect(stackTestFiles(root)).toEqual(['src/server/a/actions.test.ts']);
    rmSync(root, { recursive: true });
  });

  it('finds the four files that skip without a stack today', () => {
    expect(stackTestFiles(join(import.meta.dirname, '..', 'apps', 'web'))).toEqual(
      expect.arrayContaining([
        'src/server/documents/actions.test.ts',
        'src/server/expenses/actions.test.ts',
        'src/server/extraction/actions.test.ts',
        'src/server/properties/wizard.test.ts',
      ]),
    );
  });
});
