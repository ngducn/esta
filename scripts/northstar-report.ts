import { z } from 'zod';
import type { Outcome } from './phase-exit.ts';

const playwrightTest = z.object({
  status: z.enum(['expected', 'unexpected', 'flaky', 'skipped']),
  annotations: z.array(z.object({ type: z.string() })),
});
type PlaywrightSuite = {
  readonly specs: readonly { readonly title: string; readonly tests: readonly z.infer<typeof playwrightTest>[] }[];
  readonly suites: readonly PlaywrightSuite[];
};
const playwrightSuite: z.ZodType<PlaywrightSuite> = z.lazy(() =>
  z.object({ specs: z.array(z.object({ title: z.string(), tests: z.array(playwrightTest) })), suites: z.array(playwrightSuite).default([]) }),
);
const playwrightReport = z.object({ suites: z.array(playwrightSuite) });

type StepState = 'passed' | 'fixme' | 'skipped' | 'failed' | 'flaky';

export const NORTH_STAR_PHASE_4: Readonly<Record<number, StepState>> = { 1: 'passed', 2: 'passed', 3: 'passed', 4: 'passed', 5: 'passed', 6: 'passed', 7: 'fixme', 8: 'passed', 9: 'fixme' };

function stepState({ status, annotations }: z.infer<typeof playwrightTest>): StepState {
  if (status === 'skipped') return annotations.some(({ type }) => type === 'fixme') ? 'fixme' : 'skipped';
  return ({ expected: 'passed', unexpected: 'failed', flaky: 'flaky' } as const)[status];
}

export function verifyNorthStar(report: string, expected: Readonly<Record<number, StepState>>): Outcome {
  let json: unknown;
  try {
    json = JSON.parse(report);
  } catch {
    return { pass: false, detail: 'Playwright wrote no JSON report' };
  }
  const parsed = playwrightReport.safeParse(json);
  if (!parsed.success) return { pass: false, detail: `the Playwright report: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}` };
  const specs = (suites: readonly PlaywrightSuite[]): PlaywrightSuite['specs'] => suites.flatMap((suite) => [...suite.specs, ...specs(suite.suites)]);
  const ran = new Map<number, StepState[]>();
  const unnumbered: string[] = [];
  for (const { title, tests } of specs(parsed.data.suites)) {
    const steps = (/^steps? ([\d, and]+):/.exec(title)?.[1] ?? '').match(/\d+/g)?.map(Number) ?? [];
    if (steps.length === 0) unnumbered.push(`"${title}" names no step`);
    for (const step of steps) ran.set(step, [...(ran.get(step) ?? []), ...tests.map(stepState)]);
  }
  const problems = [...new Set([...Object.keys(expected).map(Number), ...ran.keys()])]
    .sort((a, b) => a - b)
    .flatMap((step) => {
      const states = ran.get(step) ?? [];
      if (states.length === 0) return [`step ${step} did not run`];
      return states.every((state) => state === expected[step]) ? [] : [`step ${step} ${states.join(' and ')}`];
    })
    .concat(unnumbered);
  const wanted = (state: StepState) => Object.keys(expected).filter((step) => expected[Number(step)] === state).join(', ');
  const summary = `steps ${wanted('passed')} passed; ${wanted('fixme')} fixme`;
  return problems.length === 0 ? { pass: true, detail: summary } : { pass: false, detail: `${problems.join(', ')}; expected ${summary}` };
}
