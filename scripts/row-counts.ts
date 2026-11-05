import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { localTarget, readExport, runSql, type Manifest } from './export-source.ts';

export type Difference = { readonly what: string; readonly exported: number; readonly live: number };

/** What the database holds that the manifest does not say, or the other way round; an empty list is a match. */
export function differences(manifest: Manifest, live: ReadonlyMap<string, number>): Difference[] {
  const tables = EXPORT_TABLES.map(({ name }) => ({ what: name, exported: manifest.tables[name] ?? 0, live: live.get(name) ?? 0 }));
  return [...tables, { what: 'files', exported: manifest.files, live: live.get('files') ?? 0 }].filter((row) => row.exported !== row.live);
}

function liveCounts(dbUrl: string, householdId: string): Map<string, number> {
  const counts = EXPORT_TABLES.map(({ name, scope }) => `select '${name}' as what, count(*)::int as n from public.${name} where ${scope} = '${householdId}'`);
  const files = `select 'files' as what, count(*)::int as n from storage.objects where bucket_id in ('documents', 'property-photos') and name like '${householdId}/%'`;
  return new Map(runSql<{ what: string; n: number }>(dbUrl, [...counts, files].join('\nunion all\n')).map((row) => [row.what, row.n]));
}

if (import.meta.main) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('Usage: node scripts/row-counts.ts <export zip or folder>...');
    process.exit(2);
  }
  const target = localTarget();
  const { manifest } = readExport(paths);
  const found = differences(manifest, liveCounts(target.dbUrl, manifest.householdId));
  if (found.length === 0) {
    console.log('all tables match');
  } else {
    for (const { what, exported, live } of found) console.log(`${what}: exported ${exported}, database ${live}`);
    console.log(`${found.length} difference(s)`);
    process.exit(1);
  }
}
