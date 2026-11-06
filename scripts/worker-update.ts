import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

export type Step = (command: string, args: readonly string[], cwd: string) => void;

const git = (repo: string, args: readonly string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

const dirty = (repo: string) => (git(repo, ['status', '--porcelain']) !== '' ? 'Refusing to update: the worker clone has uncommitted changes. Commit or discard them first.' : null);

const notTag = (ref: string) => `Refusing to update: ${ref} is not a tag in this clone. Releases are tags; check the name.`;

/** Syntax only, so hostile input never reaches git: no leading dash, and a valid ref name once under refs/tags. */
function isTagName(ref: string): boolean {
  if (ref.startsWith('-')) return false;
  try {
    execFileSync('git', ['check-ref-format', `refs/tags/${ref}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** A real tag name only: `refs/tags/<name>` exists. `v3~1`, `v3^`, `HEAD`, a branch and a sha are not releases. */
function tagRefusal(repo: string, ref: string): string | null {
  try {
    git(repo, ['show-ref', '--verify', '--quiet', `refs/tags/${ref}`]);
  } catch {
    return notTag(ref);
  }
  return null;
}

/** Moves the clone to the tag, installs what the tag pins and restarts the launchd job (DEPLOY.md section 13). The tag is checked after the fetch, because a new release is not in the clone until then. */
export function updateWorker(repo: string, ref: string | undefined, step: Step, uid: string): string | null {
  if (ref === undefined || ref.trim() === '') return 'Usage: pnpm worker:update <release tag>';
  const unclean = dirty(repo);
  if (unclean !== null) return unclean;
  if (!isTagName(ref)) return notTag(ref);
  step('git', ['fetch', '--tags', '--prune'], repo);
  const bad = tagRefusal(repo, ref);
  if (bad !== null) return bad;
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
