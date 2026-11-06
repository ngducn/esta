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

function listed(root: string, ...args: string[]): string[] | undefined {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  return result.stdout.split('\n').filter((line) => line.endsWith('.sql')).map((line) => line.slice(line.lastIndexOf('/') + 1));
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  const main = listed(root, 'ls-tree', '--name-only', 'origin/main', `${MIGRATIONS}/`);
  if (main === undefined) {
    console.log('Migration order: no origin/main to compare with, skipped.');
  } else {
    const branch = listed(root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', MIGRATIONS) ?? [];
    const problems = migrationOrderProblems(branch, main);
    for (const problem of problems) console.error(problem);
    if (problems.length === 0) console.log('Migration order: every new migration sorts after the newest on origin/main.');
    else process.exit(1);
  }
}
