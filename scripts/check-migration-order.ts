import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const MIGRATIONS = 'supabase/migrations';

/** Every migration this branch holds that is not on main must sort after the newest one on main, or it applies out of order after a merge. */
export function migrationOrderProblems(branch: readonly string[], main: readonly string[]): string[] {
  const newest = [...main].toSorted().at(-1);
  if (newest === undefined) return [];
  const onMain = new Set(main);
  const version = (name: string) => name.split('_')[0] ?? name;
  return branch
    .filter((name) => !onMain.has(name) && version(name) <= version(newest))
    .toSorted()
    .map((name) => `${name} sorts at or below ${newest}, the newest migration on origin/main. Rename it to a later timestamp.`);
}

/** What to do when origin/main cannot be read: CI must fail, because a gate that skips there passes a bad order. */
export function baseRefMissing(env: Readonly<Record<string, string | undefined>>): { exitCode: number; message: string } {
  if (env.CI) return { exitCode: 1, message: 'Migration order: no origin/main to compare with. CI must fetch origin/main (fetch-depth 0, or git fetch origin main).' };
  return { exitCode: 0, message: 'Migration order: no origin/main to compare with, skipped.' };
}

function listed(root: string, ...args: string[]): string[] | undefined {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  return result.stdout.split('\n').filter((line) => line.endsWith('.sql')).map((line) => line.slice(line.lastIndexOf('/') + 1));
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  const main = listed(root, 'ls-tree', '--name-only', 'origin/main', `${MIGRATIONS}/`);
  if (main === undefined) {
    const { exitCode, message } = baseRefMissing(process.env);
    (exitCode === 0 ? console.log : console.error)(message);
    if (exitCode !== 0) process.exit(exitCode);
  } else {
    const branch = listed(root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', MIGRATIONS) ?? [];
    const problems = migrationOrderProblems(branch, main);
    for (const problem of problems) console.error(problem);
    if (problems.length === 0) console.log('Migration order: every new migration sorts after the newest on origin/main.');
    else process.exit(1);
  }
}
