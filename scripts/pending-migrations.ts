import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { query } from './db-checksum.ts';

export function pendingMigrations(files: readonly string[], applied: ReadonlySet<string>): string[] {
  return files.filter((file) => /^\d+_.+\.sql$/.test(file) && !applied.has(file.split('_')[0] ?? '')).toSorted();
}

/** `supabase start` on an existing volume applies no migration, so a branch switch can leave the database behind the repo. */
export function slotPendingMigrations(repoRoot: string, workdir: string): string[] {
  const applied = query<{ version: string }>(workdir, 'select version from supabase_migrations.schema_migrations');
  return pendingMigrations(readdirSync(join(repoRoot, 'supabase', 'migrations')), new Set(applied.map((row) => row.version)));
}
