import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { updateWorker } from './worker-update.ts';

let repo = '';
let steps: string[] = [];
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
const record = (command: string, args: readonly string[]) => void steps.push(`${command} ${args.join(' ')}`);

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'worker-update-'));
  steps = [];
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'demo@test.esta.test');
  git('config', 'user.name', 'Demo');
  writeFileSync(join(repo, 'a.txt'), 'one');
  git('add', '.');
  git('commit', '-qm', 'one');
  git('tag', 'v1.0.0');
});

describe('updateWorker', () => {
  it('moves a clean clone to a tag, installs and restarts, in that order', () => {
    expect(updateWorker(repo, 'v1.0.0', record, '501')).toBeNull();
    expect(steps).toEqual(['git fetch --tags --prune', 'git checkout --detach refs/tags/v1.0.0', 'pnpm install --frozen-lockfile', 'launchctl kickstart -k gui/501/vn.esta.agent']);
  });

  it('refuses a branch name, which is not a release, and runs nothing', () => {
    expect(updateWorker(repo, 'main', record, '501')).toMatch(/main is not a tag/);
    expect(steps).toEqual([]);
  });

  it('refuses a bare commit id', () => {
    expect(updateWorker(repo, git('rev-parse', 'HEAD').trim(), record, '501')).toMatch(/is not a tag/);
  });

  it('refuses a dirty tree, tracked or untracked', () => {
    writeFileSync(join(repo, 'a.txt'), 'edited');
    expect(updateWorker(repo, 'v1.0.0', record, '501')).toMatch(/uncommitted changes/);
    git('checkout', '--', 'a.txt');
    writeFileSync(join(repo, 'new.txt'), 'x');
    expect(updateWorker(repo, 'v1.0.0', record, '501')).toMatch(/uncommitted changes/);
    expect(steps).toEqual([]);
  });

  it('refuses a missing tag name with the usage line', () => {
    expect(updateWorker(repo, undefined, record, '501')).toBe('Usage: pnpm worker:update <release tag>');
  });
});
