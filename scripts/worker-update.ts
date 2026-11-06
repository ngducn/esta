import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

export type Step = (command: string, args: readonly string[], cwd: string) => void;

const git = (repo: string, args: readonly string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

/** Why the worker's clone must not move to `ref`, or null when it may. A branch name or a bare commit is not a release. */
export function refusal(repo: string, ref: string | undefined): string | null {
  if (ref === undefined || ref.trim() === '') return 'Usage: pnpm worker:update <release tag>';
  if (git(repo, ['status', '--porcelain']) !== '') return 'Refusing to update: the worker clone has uncommitted changes. Commit or discard them first.';
  try {
    git(repo, ['rev-parse', '--verify', '--quiet', `refs/tags/${ref}^{commit}`]);
  } catch {
    return `Refusing to update: ${ref} is not a tag in this clone. Releases are tags; run git fetch --tags and check the name.`;
  }
  return null;
}

/** Moves the clone to the tag, installs what the tag pins and restarts the launchd job (DEPLOY.md section 8). */
export function updateWorker(repo: string, ref: string | undefined, step: Step, uid: string): string | null {
  const stop = refusal(repo, ref);
  if (stop !== null || ref === undefined) return stop;
  step('git', ['fetch', '--tags', '--prune'], repo);
  const again = refusal(repo, ref);
  if (again !== null) return again;
  step('git', ['checkout', '--detach', `refs/tags/${ref}`], repo);
  step('pnpm', ['install', '--frozen-lockfile'], repo);
  step('launchctl', ['kickstart', '-k', `gui/${uid}/vn.esta.agent`], repo);
  return null;
}

if (import.meta.main) {
  const run: Step = (command, args, cwd) => {
    console.log(`$ ${command} ${args.join(' ')}`);
    if (spawnSync(command, [...args], { cwd, stdio: 'inherit' }).status !== 0) throw new Error(`${command} ${args[0] ?? ''} failed`);
  };
  const message = updateWorker(join(import.meta.dirname, '..'), process.argv[2], run, String(process.getuid?.() ?? ''));
  if (message !== null) {
    console.error(message);
    process.exit(2);
  }
  console.log(`worker updated to ${process.argv[2]}`);
}
