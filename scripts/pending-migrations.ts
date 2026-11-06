import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { query } from './db-checksum.ts';

export function pendingMigrations(files: readonly string[], applied: ReadonlySet<string>): string[] {
  return files.filter((file) => /^\d+_.+\.sql$/.test(file) && !applied.has(file.split('_')[0] ?? '')).toSorted();
}

type Query = <Row>(workdir: string, sql: string) => Row[];

/** A reset that stopped partway leaves a database with no migrations table; that means every migration is pending, not an error. */
export function appliedVersions(workdir: string, run: Query = query): Set<string> {
  const [{ present } = { present: false }] = run<{ present: boolean }>(workdir, "select to_regclass('supabase_migrations.schema_migrations') is not null as present");
  return present ? new Set(run<{ version: string }>(workdir, 'select version from supabase_migrations.schema_migrations').map((row) => row.version)) : new Set();
}

/** `supabase start` on an existing volume applies no migration, so a branch switch can leave the database behind the repo. */
export function slotPendingMigrations(repoRoot: string, workdir: string): string[] {
  return pendingMigrations(readdirSync(join(repoRoot, 'supabase', 'migrations')), appliedVersions(workdir));
}
