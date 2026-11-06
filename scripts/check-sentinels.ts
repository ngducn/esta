import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ALLOWLIST = 'quality/sentinels.json';

const RAISED = /'(ESTA_[A-Z0-9_]+)'/g;

/** Every `'ESTA_*'` literal a migration raises. */
export function raisedSentinels(migrations: readonly string[]): string[] {
  return [...new Set(migrations.flatMap((sql) => [...sql.matchAll(RAISED)].map((match) => match[1] ?? '')))].toSorted();
}

/** A sentinel counts as mapped when TypeScript quotes it or keys a table with it. */
export function mappedIn(source: string, sentinel: string): boolean {
  return new RegExp(`['"\`]${sentinel}['"\`]|\\b${sentinel}\\s*:`).test(source);
}

/**
 * A sentinel a migration raises is mapped to a refusal in TypeScript, or sits on the internal allowlist with a reason.
 * The list only shrinks: a mapped sentinel must leave it, and so must one no migration raises any more.
 */
export function sentinelProblems(raised: readonly string[], sources: readonly string[], allow: Readonly<Record<string, string>>): string[] {
  const mapped = new Set(raised.filter((name) => sources.some((source) => mappedIn(source, name))));
  return [
    ...raised.filter((name) => !mapped.has(name) && !Object.hasOwn(allow, name)).map((name) => `${name} is raised by a migration but no refusal table names it; map it (dbRefusal, packages/ops/src/kit.ts) or add it to ${ALLOWLIST} with a reason`),
    ...Object.keys(allow).filter((name) => mapped.has(name)).map((name) => `${name} is mapped in TypeScript now; remove it from ${ALLOWLIST}`),
    ...Object.keys(allow).filter((name) => !raised.includes(name)).map((name) => `${name} is no longer raised by any migration; remove it from ${ALLOWLIST}`),
    ...Object.entries(allow).filter(([, reason]) => reason.trim() === '').map(([name]) => `${name} has no reason in ${ALLOWLIST}`),
  ];
}

function trackedFiles(root: string, pathspecs: readonly string[]): string[] {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...pathspecs], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('git ls-files failed');
  return result.stdout.split('\n').filter(Boolean);
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  const read = (file: string) => readFileSync(join(root, file), 'utf8');
  const migrations = trackedFiles(root, ['supabase/migrations/*.sql']).map(read);
  const code = trackedFiles(root, ['apps/*.ts', 'apps/*.tsx', 'packages/*.ts', 'packages/*.tsx', 'scripts/*.ts']).filter((file) => !/\.test\.tsx?$/.test(file) && !file.endsWith('check-sentinels.ts'));
  const allow = JSON.parse(read(ALLOWLIST)) as Record<string, string>;
  const raised = raisedSentinels(migrations);
  const problems = sentinelProblems(raised, code.map(read), allow);
  for (const problem of problems) console.error(problem);
  if (problems.length === 0) console.log(`Sentinels: ${raised.length} raised, ${Object.keys(allow).length} internal and listed with a reason; none is unmapped.`);
  else process.exit(1);
}
