import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..');
const pinned = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).devEngines?.runtime;

/**
 * Before nodejs/node#65113 (24.21.0, 26.8.0), `require` stopped resolving symlinks once anything in the process had
 * stat'ed a pipe or a socket. Through pnpm's `apps/web/node_modules/next` link, `next dev` then loaded a second copy
 * of Next whose request store was always empty, and route handlers failed with "`cookies` was called outside a
 * request scope" (#292, #127). The child's stdin is a pipe, so its `fstatSync(0)` is that stat.
 */
const resolveAfterPipeStat = `
  const { createRequire } = require('node:module');
  const { fstatSync, realpathSync } = require('node:fs');
  const web = createRequire(${JSON.stringify(join(repoRoot, 'apps/web/package.json'))});
  web.resolve('next/package.json');
  fstatSync(0);
  const resolved = web.resolve('next/dist/server/require-hook.js');
  process.stdout.write(JSON.stringify({ resolved, real: realpathSync.native(resolved) }));
`;

describe('the pinned Node runtime', () => {
  it('is the one .nvmrc names, so CI and pnpm scripts run the same Node', () => {
    expect(pinned).toMatchObject({ name: 'node', onFail: 'download' });
    expect(readFileSync(join(repoRoot, '.nvmrc'), 'utf8').trim()).toBe(pinned?.version);
  });

  it('runs this test, as it runs every pnpm script', () => {
    expect(process.version).toBe(`v${pinned?.version}`);
  });

  it('resolves Next through the pnpm symlink to one real path after a pipe was stat-ed', () => {
    const child = spawnSync(process.execPath, ['-e', resolveAfterPipeStat], { input: '', encoding: 'utf8' });
    expect(child.stderr).toBe('');
    const { resolved, real } = JSON.parse(child.stdout);
    expect(resolved).toBe(real);
  });
});
