import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const tracked = (pattern: string) => execFileSync('git', ['ls-files', pattern], { cwd: root, encoding: 'utf8' }).split('\n').filter((path) => path !== '');
const integrationFiles = tracked('*.integration.test.ts');
const jobText = readdirSync(join(root, 'tools', 'ci', 'jobs'))
  .map((name) => readFileSync(join(root, 'tools', 'ci', 'jobs', name), 'utf8'))
  .join('\n');

/** The workspace folder (apps/web, apps/connector) an integration file belongs to. */
const workspaceOf = (file: string) => file.split('/').slice(0, 2).join('/');
const packageOf = (workspace: string) => JSON.parse(readFileSync(join(root, workspace, 'package.json'), 'utf8')) as { name: string; scripts?: Record<string, string> };
const ranByCi = (workspace: string) => {
  const { name } = packageOf(workspace);
  const short = name.replace(/^@esta\//, '');
  return new RegExp(`^\\s*pnpm --filter (?:${name}|${short}) test:integration\\s*$`, 'm').test(jobText);
};

/** The only way an integration test may wait for the stack: a stack that is down fails the run (apps/web/src/test/stack.ts). */
const ALLOWED_WAIT = /skipIf\(!stackUp\)/g;
const SKIP_FORMS = /\b(?:test|it|describe)(?:\.\w+)*\.(?:skip|todo|runIf|skipIf|only)\b|\b(?:ctx|context|t)\.skip\b|\b(?:xit|xtest|xdescribe)\(|\.(?:skip|todo|runIf|skipIf)\(/;

describe('integration tests reach a CI job (#122, #461)', () => {
  it('finds the integration files', () => {
    expect(integrationFiles.length).toBeGreaterThan(10);
  });

  it('runs every integration file through a workspace whose test:integration a tools/ci/jobs script calls', () => {
    const workspaces = [...new Set(integrationFiles.map(workspaceOf))];
    expect(workspaces.toSorted()).toEqual(['apps/connector', 'apps/web']);
    for (const workspace of workspaces) {
      expect(packageOf(workspace).scripts?.['test:integration'], `${workspace} defines test:integration`).toBeDefined();
      expect(ranByCi(workspace), `${workspace}: no tools/ci/jobs script runs "pnpm --filter ${packageOf(workspace).name} test:integration"`).toBe(true);
    }
  });

  it('knows no workspace with a test:integration script that the integration files miss', () => {
    const declared = tracked('*/package.json')
      .filter((path) => packageOf(dirname(path)).scripts?.['test:integration'] !== undefined)
      .map(dirname)
      .toSorted();
    expect(declared).toEqual([...new Set(integrationFiles.map(workspaceOf))].toSorted());
  });

  it('lets an integration file wait for the stack only through skipIf(!stackUp), never skip, todo, runIf or only', () => {
    for (const file of integrationFiles) {
      expect(readFileSync(join(root, file), 'utf8').replace(ALLOWED_WAIT, ''), file).not.toMatch(SKIP_FORMS);
    }
  });

  it('catches each way a test can slip out of the run', () => {
    for (const text of ['describe.runIf(stackUp)("x", () => {})', 'it.concurrent.skip("x", () => {})', 'test.todo("x")', 'ctx.skip()', 'it.only("x", () => {})', 'xit("x", () => {})', 'describe.skipIf(!ready)("x", () => {})']) {
      expect(text.replace(ALLOWED_WAIT, ''), text).toMatch(SKIP_FORMS);
    }
    expect('describe.skipIf(!stackUp)("x", () => {})'.replace(ALLOWED_WAIT, '')).not.toMatch(SKIP_FORMS);
  });
});
