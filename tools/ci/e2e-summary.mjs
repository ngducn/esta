// Usage: node tools/ci/e2e-summary.mjs <merged Playwright JSON report>
//
// Prints the merged end-to-end counts and one warning per flaky test (a test that failed and then passed on its
// retry), and appends the same to the job summary on GitHub Actions. Exits 1 when a project in playwright.config.ts
// ran in no shard, because the shard matrix in ci.yml names its projects by hand.
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import config from '../../playwright.config.ts';
import { testsOf } from '../flaky-report.mjs';

const tests = testsOf(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const count = (status) => tests.filter((test) => test.status === status).length;
const ran = new Set(tests.map((test) => test.project));
const missing = (config.projects ?? []).map((project) => project.name).filter((name) => !ran.has(name));
const flaky = tests.filter((test) => test.status === 'flaky');

const rows = [
  ['passed', count('expected')],
  ['failed', count('unexpected')],
  ['flaky', flaky.length],
  ['skipped', count('skipped')],
  ['total', tests.length],
];
const markdown = [
  '### End-to-end tests',
  '',
  `| ${rows.map(([name]) => name).join(' | ')} |`,
  `| ${rows.map(() => '---').join(' | ')} |`,
  `| ${rows.map(([, value]) => value).join(' | ')} |`,
  '',
  ...(flaky.length > 0 ? ['Flaky, each passed on its one retry:', '', ...flaky.map((test) => `- ${test.title}`), ''] : []),
  ...(missing.length > 0 ? [`No shard ran the project(s) ${missing.join(', ')}. Add them to the e2e matrix in .github/workflows/ci.yml.`, ''] : []),
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
process.stdout.write(
  [
    rows.map(([name, value]) => `${name}: ${value}`).join(', '),
    ...flaky.map((test) => `::warning title=Flaky test::${test.title}`),
    ...missing.map((name) => `::error title=Project ran in no shard::${name}`),
    '',
  ].join('\n'),
);
process.exitCode = missing.length > 0 ? 1 : 0;
