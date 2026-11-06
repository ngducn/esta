import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');

/** Real path of a folder that may not exist yet: resolves the deepest existing parent, so a symlink or `..` cannot dodge a comparison. */
function realish(path: string): string {
  const abs = resolve(path);
  return existsSync(abs) ? realpathSync(abs) : join(realish(dirname(abs)), abs.slice(dirname(abs).length + 1));
}

const isInside = (child: string, parent: string) => {
  const rel = relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`);
};

type Source = Readonly<Record<string, string | undefined>>;

/** The rsync call, or why there is none: the copy goes only where Ryan said, and never guesses a destination. */
export function offsitePlan(source: Source): { readonly args: readonly string[] } | { readonly refusal: string } {
  const from = source.ESTA_BACKUP_DIR?.trim();
  const to = source.ESTA_BACKUP_OFFSITE?.trim();
  if (to === undefined || to === '') return { refusal: 'Refusing to copy: ESTA_BACKUP_OFFSITE is not set. Name the destination (a mounted drive path or an rsync target) in the worker file.' };
  if (from === undefined || from === '') return { refusal: 'Refusing to copy: ESTA_BACKUP_DIR is not set.' };
  if (!existsSync(from)) return { refusal: `Refusing to copy: the backup folder ${from} does not exist.` };
  if (!/^[^/:]+:/.test(to)) {
    const target = realish(to);
    const backup = realpathSync(from);
    if (target === backup) return { refusal: 'Refusing to copy: ESTA_BACKUP_OFFSITE is the same folder as ESTA_BACKUP_DIR.' };
    if (isInside(target, backup)) return { refusal: 'Refusing to copy: ESTA_BACKUP_OFFSITE is inside the backup folder; each run would nest another copy.' };
    const repo = realpathSync(repoRoot);
    if (target === repo || isInside(target, repo)) return { refusal: 'Refusing to copy: ESTA_BACKUP_OFFSITE is inside the repo working tree, which is public.' };
  }
  return { args: ['-a', '--', `${from.replace(/\/+$/, '')}/`, `${to.replace(/\/+$/, '')}/`] };
}

if (import.meta.main) {
  const plan = offsitePlan(process.env);
  if ('refusal' in plan) {
    console.error(plan.refusal);
    process.exit(2);
  }
  process.exit(spawnSync('rsync', [...plan.args], { stdio: 'inherit' }).status ?? 1);
}
