import { describe, expect, it } from 'vitest';
import { NORTH_STAR_PHASE_4, verifyNorthStar } from './northstar-report.ts';

type Step = 'passed' | 'fixme' | 'skip' | 'failed';
const northStarTitles: Readonly<Record<string, Step>> = {
  'steps 1 and 2: Mẹ signs in and adds Dãy trọ Dĩ An': 'passed',
  'step 3: 8 rooms and 6 leases': 'passed',
  'step 4: October bills': 'passed',
  'step 5: Ryan imports the October statement': 'passed',
  'step 6: the October board': 'passed',
  'step 7: the morning brief': 'fixme',
  'step 8: the tax card': 'passed',
  'step 9: Ryan asks how much Dĩ An collected': 'fixme',
};

function playwrightReport(titles: Readonly<Record<string, Step>>): string {
  const test = (step: Step) => ({
    status: { passed: 'expected', fixme: 'skipped', skip: 'skipped', failed: 'unexpected' }[step],
    annotations: [{ type: 'serial' }, ...(step === 'fixme' || step === 'skip' ? [{ type: step }] : [])],
  });
  const specs = Object.entries(titles).map(([title, step]) => ({ title, tests: [test(step)] }));
  return JSON.stringify({ suites: [{ title: 'northstar.spec.ts', specs, suites: [] }], errors: [] });
}

describe('verifyNorthStar', () => {
  it('passes steps 1 to 6 and 8 passed with 7 and 9 fixme', () => {
    expect(verifyNorthStar(playwrightReport(northStarTitles), NORTH_STAR_PHASE_4)).toEqual({ pass: true, detail: 'steps 1, 2, 3, 4, 5, 6, 8 passed; 7, 9 fixme' });
  });

  it('fails a run that skipped step 8, a failed step and a missing step, naming each', () => {
    const { 'step 4: October bills': _, ...withoutStep4 } = northStarTitles;
    const outcome = verifyNorthStar(playwrightReport({ ...withoutStep4, 'step 3: 8 rooms and 6 leases': 'failed', 'step 8: the tax card': 'skip' }), NORTH_STAR_PHASE_4);
    expect(outcome).toEqual({ pass: false, detail: 'step 3 failed, step 4 did not run, step 8 skipped; expected steps 1, 2, 3, 4, 5, 6, 8 passed; 7, 9 fixme' });
  });

  it('fails a fixme step that ran, an extra test and a report that is not JSON', () => {
    expect(verifyNorthStar(playwrightReport({ ...northStarTitles, 'step 7: the morning brief': 'passed', 'a warm-up': 'passed' }), NORTH_STAR_PHASE_4).detail).toBe(
      'step 7 passed, "a warm-up" names no step; expected steps 1, 2, 3, 4, 5, 6, 8 passed; 7, 9 fixme',
    );
    expect(verifyNorthStar('', NORTH_STAR_PHASE_4)).toEqual({ pass: false, detail: 'Playwright wrote no JSON report' });
  });
});
