import { describe, expect, it } from 'vitest';
import { gatewayRetryFiles, GATEWAY_ERROR, parseReport, type VitestReport } from './web-integration-report.ts';

const WEB = '/repo/apps/web';
const gateway = 'Reading the lease schedule failed: An invalid response was received from the upstream server';
const test = (status: string, failureMessages: string[] = []) => ({ fullName: `case ${status}`, status, failureMessages });
const file = (name: string, status: string, assertionResults: ReturnType<typeof test>[], message = '') => ({ name: `${WEB}/${name}`, status, message, assertionResults });
const report = (...testResults: VitestReport['testResults']): VitestReport => ({ testResults });

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
