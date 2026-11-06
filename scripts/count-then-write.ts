import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from './db-checksum.ts';
import { parseSlot, slotWorkdir } from './slot.ts';

export const BASELINE = 'quality/count-then-write.json';

/** Definer functions that count rows and insert without an advisory lock: two calls at once can both pass the count (Q-16). */
export function unlockedCountWrites(workdir: string): string[] {
  return query<{ name: string }>(
    workdir,
    `select n.nspname || '.' || p.proname as name
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prosecdef and n.nspname in ('public', 'private')
       and p.prosrc ~* 'count\\s*\\(' and p.prosrc ~* 'insert\\s+into' and p.prosrc !~* 'pg_advisory_xact_lock'
     order by 1`,
  ).map(({ name }) => name);
}

/** The list only shrinks: a new function must take the lock, and a fixed one must leave the baseline. */
export function countThenWriteProblems(found: readonly string[], baseline: readonly string[]): string[] {
  return [
    ...found.filter((name) => !baseline.includes(name)).map((name) => `${name} counts rows and inserts without pg_advisory_xact_lock; take the lock, or serialize the writers, and test two calls at once`),
    ...baseline.filter((name) => !found.includes(name)).map((name) => `${name} no longer counts and inserts without a lock; remove it from ${BASELINE}`),
  ];
}

export function reportCountThenWrite(repoRoot: string, slot: number): boolean {
  const baseline = JSON.parse(readFileSync(join(repoRoot, BASELINE), 'utf8')) as string[];
  const problems = countThenWriteProblems(unlockedCountWrites(slotWorkdir(repoRoot, slot)), baseline);
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`Count then write: ${baseline.length} definer functions are baselined; none is new.`);
  return problems.length === 0;
}

if (import.meta.main && !reportCountThenWrite(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT))) process.exit(1);
