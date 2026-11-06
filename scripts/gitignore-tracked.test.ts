import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

const FORCE_ADDED: Record<string, string> = {
  'docs/plan/trail/decisions.tsv': 'the coordinator\'s decision trail, committed on purpose (pstack show-me-your-work)',
  'docs/plan/trail/phase-5/live-run.log': 'the recorded Phase 5 live run, kept as evidence',
};

describe('.gitignore', () => {
  it('ignores no folder that holds source: a bare `reports/` once hid apps/web/src/app/(app)/reports from knip and from `git add`', () => {
    const tracked = execFileSync('git', ['ls-files', '-ci', '--exclude-per-directory=.gitignore'], { cwd: root, encoding: 'utf8' }).split('\n').filter((path) => path !== '');
    expect(tracked.filter((path) => !(path in FORCE_ADDED))).toEqual([]);
  });
});
