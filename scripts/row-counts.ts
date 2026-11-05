import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { localTarget, readExport, runSql, type Manifest } from './export-source.ts';

const MISSING_SHOWN = 10;

export type Difference = { readonly what: string; readonly exported: number; readonly live: number };

export function differences(manifest: Manifest, live: ReadonlyMap<string, number>): Difference[] {
  const tables = EXPORT_TABLES.map(({ name }) => ({ what: name, exported: manifest.tables[name] ?? 0, live: live.get(name) ?? 0 }));
  return [...tables, { what: 'files', exported: manifest.files, live: live.get('files') ?? 0 }].filter((row) => row.exported !== row.live);
}

/** Exported files the database's Storage lacks: a count can match while a name is wrong. */
export const missingFiles = (exported: Iterable<string>, live: ReadonlySet<string>): string[] => [...exported].filter((name) => !live.has(name));

/** What the command prints. The first line says a match only for what this file holds; a withheld table is named, never counted as matching. */
export function report(manifest: Manifest, found: readonly Difference[], missing: readonly string[]): string[] {
  if (found.length === 0 && missing.length === 0 && manifest.complete) {
    return [`all tables and files match (${Object.keys(manifest.tables).length} tables, ${manifest.files} files)`, 'nothing was withheld: this is the complete copy'];
  }
  if (found.length === 0 && missing.length === 0) {
    const left = manifest.withheld.map((entry) => entry.table).join(', ');
    return [
      `tables and files match what this export holds (${Object.keys(manifest.tables).length} tables, ${manifest.files} files)`,
      `left out of this export, so not compared: ${left || 'nothing'}; the nightly backup is the complete copy`,
    ];
  }
  return [
    ...found.map(({ what, exported, live }) => `${what}: exported ${exported}, database ${live}`),
    ...missing.slice(0, MISSING_SHOWN).map((name) => `missing file: ${name}`),
    ...(missing.length > MISSING_SHOWN ? [`and ${missing.length - MISSING_SHOWN} more missing files`] : []),
    `${found.length + missing.length} difference(s)`,
  ];
}

function liveFileNames(dbUrl: string, householdId: string): Set<string> {
  const rows = runSql<{ name: string }>(dbUrl, `select bucket_id || '/' || name as name from storage.objects where bucket_id in ('documents', 'property-photos') and name like '${householdId}/%'`);
  return new Set(rows.map((row) => row.name));
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
  const { manifest, files } = readExport(paths);
  const found = differences(manifest, liveCounts(target.dbUrl, manifest.householdId));
  const missing = missingFiles(files.keys(), liveFileNames(target.dbUrl, manifest.householdId));
  for (const line of report(manifest, found, missing)) console.log(line);
  if (found.length > 0 || missing.length > 0) process.exit(1);
}
