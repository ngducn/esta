import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

type Source = Readonly<Record<string, string | undefined>>;

/** The rsync call, or why there is none: the copy goes only where Ryan said, and never guesses a destination. */
export function offsitePlan(source: Source): { readonly args: readonly string[] } | { readonly refusal: string } {
  const from = source.ESTA_BACKUP_DIR?.trim();
  const to = source.ESTA_BACKUP_OFFSITE?.trim();
  if (to === undefined || to === '') return { refusal: 'Refusing to copy: ESTA_BACKUP_OFFSITE is not set. Name the destination (a mounted drive path or an rsync target) in the worker file.' };
  if (from === undefined || from === '') return { refusal: 'Refusing to copy: ESTA_BACKUP_DIR is not set.' };
  if (!existsSync(from)) return { refusal: `Refusing to copy: the backup folder ${from} does not exist.` };
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
