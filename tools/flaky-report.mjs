// Prints "flaky: N" and one title per flaky test from a Playwright JSON report.
import { readFileSync } from 'node:fs';
import process from 'node:process';

/** Every test in a Playwright JSON report, with its project, its titles joined by " > " and its final status. */
export function testsOf(report) {
  const tests = [];
  function walk(suite, trail) {
    const here = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        tests.push({ project: test.projectName, title: [test.projectName, ...here, spec.title].filter(Boolean).join(' > '), status: test.status });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  }
  for (const suite of report.suites ?? []) walk(suite, []);
  return tests;
}

if (import.meta.main) {
  const flaky = testsOf(JSON.parse(readFileSync(process.argv[2], 'utf8'))).filter((test) => test.status === 'flaky');
  process.stdout.write([`flaky: ${flaky.length}`, ...flaky.map((test) => `- ${test.title}`), ''].join('\n'));
}
