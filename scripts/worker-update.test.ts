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
  writeFileSync(join(repo, 'a.txt'), 'two');
  git('commit', '-qam', 'two');
  git('tag', 'v1.0.0');
});

describe('updateWorker', () => {
  it('moves a clean clone to a tag, installs and restarts, in that order', () => {
    expect(updateWorker(repo, 'v1.0.0', record, '501')).toBeNull();
    expect(steps).toEqual(['git fetch --tags --prune', 'git checkout --detach refs/tags/v1.0.0', 'pnpm install --frozen-lockfile', 'launchctl kickstart -k gui/501/vn.esta.agent']);
  });

  it('refuses a branch name, which is not a release, and runs nothing', () => {
    expect(updateWorker(repo, 'main', record, '501')).toMatch(/main is not a tag/);
    expect(steps.some((s) => /checkout|install|kickstart/.test(s))).toBe(false);
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

  it.each(['v1.0.0~1', 'v1.0.0^', 'HEAD', 'refs/heads/main', '--upload-pack=x', 'v1;rm -rf x', '$(id)'])('refuses %s, which is not a tag name', (ref) => {
    expect(updateWorker(repo, ref, record, '501')).toMatch(/not a tag/);
    expect(steps.some((s) => /checkout|install|kickstart/.test(s))).toBe(false);
  });

  describe('with a tag the clone lacks', () => {
    let origin = '';
    let clone = '';
    const real: typeof record = (command, args) => {
      record(command, args);
      if (command === 'git') execFileSync('git', ['-C', clone, ...args.filter((a) => a !== '--prune')]);
    };
    beforeEach(() => {
      origin = mkdtempSync(join(tmpdir(), 'worker-origin-'));
      execFileSync('git', ['clone', '-q', '--bare', repo, origin]);
      clone = mkdtempSync(join(tmpdir(), 'worker-clone-'));
      execFileSync('git', ['clone', '-q', origin, clone]);
      git('tag', 'v2.0.0');
      git('push', '-q', origin, 'v2.0.0');
    });

    it('fetches first, then accepts the new tag', () => {
      expect(updateWorker(clone, 'v2.0.0', real, '501')).toBeNull();
      expect(steps[0]).toBe('git fetch --tags --prune');
      expect(steps).toContain('git checkout --detach refs/tags/v2.0.0');
    });

    it('still refuses an ancestor of the new tag after the fetch', () => {
      expect(updateWorker(clone, 'v2.0.0~1', real, '501')).toMatch(/not a tag/);
      expect(steps).not.toContain('pnpm install --frozen-lockfile');
    });

    it('refuses a tag that does not exist even after the fetch, before checkout', () => {
      expect(updateWorker(clone, 'v9.9.9', real, '501')).toMatch(/not a tag/);
      expect(steps.some((s) => s.startsWith('git checkout'))).toBe(false);
    });
  });
});
