import { globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { APP_ROUTES } from './routes.ts';

const APP = join(import.meta.dirname, '..', 'apps', 'web', 'src', 'app');
const pages = globSync('**/page.tsx', { cwd: APP })
  .map((file) => dirname(file))
  .filter((dir) => dir !== 'dev' && !dir.startsWith('dev/'));

describe('APP_ROUTES', () => {
  test('has an entry for every page outside dev, and none for a page that is gone', () => {
    expect([...new Set(APP_ROUTES.map((entry) => entry.page))].sort()).toEqual([...pages].sort());
  });

  test('names each route once, and gives a reason for every route it cannot open', () => {
    const ids = APP_ROUTES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of APP_ROUTES) expect(entry.path === null, entry.id).toBe(entry.skip !== undefined);
  });

  test('opens each dynamic page on a concrete id', () => {
    for (const entry of APP_ROUTES) if (entry.path !== null) expect(entry.path, entry.id).not.toMatch(/\[|undefined/);
  });
});

describe('the specs that set a date', () => {
  const root = join(import.meta.dirname, '..');
  const config = readFileSync(join(root, 'playwright.config.ts'), 'utf8');
  const listOf = (name: string) =>
    [...(new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(config)?.[1] ?? '').replaceAll(/^\s*\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map(([, file = '']) => file);
  const dated = listOf('dated');
  const shared = listOf('sharedClock');
  const specs = globSync('*.spec.ts', { cwd: join(root, 'e2e') });
  const source = (file: string) => readFileSync(join(root, 'e2e', file), 'utf8');

  test('lists only specs that exist, each in one project', () => {
    expect(dated.length).toBeGreaterThan(0);
    expect([...dated, ...shared].filter((file) => !specs.includes(file))).toEqual([]);
    expect(dated.filter((file) => shared.includes(file))).toEqual([]);
  });

  test('puts every spec that moves a test clock row or starts a worker at a date in the dated or clock project', () => {
    const users = specs.filter((file) => /\b(?:workerAt|setClock|frozenAtStart)\b/.test(source(file)));
    expect(users.length).toBeGreaterThan(0);
    expect(users.filter((file) => !dated.includes(file) && !shared.includes(file)).sort()).toEqual([]);
  });

  test('keeps a spec in the dated project off the global row, the agent worker and the cron routes, and from clearing a date another spec relies on', () => {
    for (const file of dated) {
      expect(source(file), file).not.toMatch(/\b(?:globalClock|workerAt|startAgentWorker|stopAndForget)\b|api\/cron/);
      expect(source(file), file).not.toMatch(/setClock\([^)]*,\s*null\)/);
    }
  });

  test('keeps a spec that uses the global row, a worker or a cron route in the clock project', () => {
    const users = specs.filter((file) => /\b(?:globalClock|workerAt|startAgentWorker)\b|api\/cron/.test(source(file)));
    expect(users.filter((file) => !shared.includes(file)).sort()).toEqual([]);
  });

  test('writes the test clock only through the helper that takes a scope, except the spec of the route itself', () => {
    const direct = globSync('**/*.ts', { cwd: join(root, 'e2e') }).filter(
      (file) => !file.startsWith('prod/') && file !== 'helpers/test-clock.ts' && file !== 'clock.spec.ts' && !file.endsWith('routes.test.ts') && /api\/test\/clock/.test(source(file)),
    );
    expect(direct).toEqual([]);
  });
});
