// Prints "flaky: N" and one title per flaky test from a Playwright JSON report.
import { readFileSync } from 'node:fs';
import process from 'node:process';

const flaky = [];
function walk(suite, trail) {
  const here = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      if (test.status === 'flaky') flaky.push([...here, spec.title].join(' > '));
    }
  }
  for (const child of suite.suites ?? []) walk(child, here);
}

for (const suite of JSON.parse(readFileSync(process.argv[2], 'utf8')).suites ?? []) walk(suite, []);
process.stdout.write([`flaky: ${flaky.length}`, ...flaky.map((title) => `- ${title}`), ''].join('\n'));
