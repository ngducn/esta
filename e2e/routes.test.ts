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

describe('the clock project', () => {
  const root = join(import.meta.dirname, '..');
  const config = readFileSync(join(root, 'playwright.config.ts'), 'utf8');
  const listed = [...(/const sharedClock = \[([^\]]*)\]/.exec(config)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(([, name = '']) => name);

  test('lists every spec that moves the test clock or starts a worker at a date, so it runs one at a time', () => {
    const users = globSync('*.spec.ts', { cwd: join(root, 'e2e') }).filter((file) => /\b(?:workerAt|setClock)\b/.test(readFileSync(join(root, 'e2e', file), 'utf8')));
    expect(users.length).toBeGreaterThan(0);
    expect(users.filter((file) => !listed.includes(file)).sort()).toEqual([]);
  });

  test('lists only specs that exist', () => {
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((file) => globSync(file, { cwd: join(root, 'e2e') }).length === 0)).toEqual([]);
  });
});
