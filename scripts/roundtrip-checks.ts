import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { localTarget, readExport, runSql } from './export-source.ts';
import { importScript, runImport } from './import-export.ts';

const [command, ...args] = process.argv.slice(2);

/** Gives a household one document whose file ends in `.jfif` and one with no extension, as a browser and a Mac can store them. */
async function oddDocumentNames(email: string): Promise<void> {
  const target = localTarget();
  const householdId = runSql<{ id: string }>(target.dbUrl, `select household_id::text as id from public.household_members where invited_email = '${email.replaceAll("'", '')}'`)[0]?.id;
  if (householdId === undefined) throw new Error(`No household member invited as ${email}`);
  const pick = (mime: string, leaf: string) =>
    runSql<{ id: string; storage_path: string }>(target.dbUrl, `select id::text as id, storage_path from public.documents where household_id = '${householdId}' and mime = '${mime}' order by id limit 1`).map((row) => ({ ...row, renamed: `${householdId}/${row.id}/${leaf}` }));
  const storage = createClient(target.apiUrl, target.serviceKey, { auth: { persistSession: false } }).storage.from('documents');
  for (const doc of [...pick('image/jpeg', 'scan.jfif'), ...pick('application/pdf', 'tai-lieu')]) {
    const { error } = await storage.move(doc.storage_path, doc.renamed);
    if (error) throw new Error(`Moving ${doc.storage_path} failed: ${error.message}`);
    runSql(target.dbUrl, `do $x$ begin set local session_replication_role = replica; update public.documents set storage_path = '${doc.renamed}' where id = '${doc.id}'; end $x$;`);
  }
  console.log('renamed one jpeg document to scan.jfif and one pdf document to tai-lieu');
}

/** Loads a copy of the export with one row repeated in a late table: the import must fail and leave no household behind. */
function failedImportLeavesNothing(paths: readonly string[]): void {
  const target = localTarget();
  const source = readExport(paths);
  const late = [...EXPORT_TABLES].reverse().find((table) => (source.tables.get(table.name)?.length ?? 0) > 0);
  const first = late === undefined ? undefined : source.tables.get(late.name)?.[0];
  if (late === undefined || first === undefined) throw new Error('The export holds no rows to break');
  const broken = { ...source, tables: new Map(source.tables).set(late.name, [...(source.tables.get(late.name) ?? []), first]) };
  const file = join(tmpdir(), `esta-rollback-${process.pid}.sql`);
  writeFileSync(file, importScript(broken), { mode: 0o600 });
  let failed = false;
  try {
    runSql(target.dbUrl, file, { file: true });
  } catch {
    failed = true;
  } finally {
    unlinkSync(file);
  }
  const households = runSql<{ n: number }>(target.dbUrl, 'select count(*)::int as n from public.households')[0]?.n;
  if (!failed) throw new Error(`The import accepted a repeated ${late.name} row`);
  if (households !== 0) throw new Error(`The import failed but left ${households} household(s) behind`);
  console.log(`a repeated ${late.name} row failed the import and left no household`);
}

/** The real import with one valuation's value nulled: the database step refuses it, and no file may stay in Storage for a household that does not exist. */
async function refusedImportLeavesNoFiles(paths: readonly string[]): Promise<void> {
  const target = localTarget();
  const source = readExport(paths);
  const valuations = source.tables.get('valuations') ?? [];
  if (valuations.length === 0) throw new Error('The export holds no valuation to break');
  const broken = { ...source, tables: new Map(source.tables).set('valuations', valuations.map((row, index) => (index === 0 ? { ...row, value_vnd: null } : row))) };
  const leftover = () => {
    const names = [...source.files.keys()].map((path) => `'${path.split('/').slice(1).join('/').replaceAll("'", "''")}'`).join(', ');
    return runSql<{ n: number }>(target.dbUrl, `select count(*)::int as n from storage.objects where bucket_id in ('documents', 'property-photos') and name in (${names})`)[0]?.n ?? 0;
  };
  let failed = false;
  try {
    await runImport(broken, target);
  } catch {
    failed = true;
  }
  const households = runSql<{ n: number }>(target.dbUrl, 'select count(*)::int as n from public.households')[0]?.n;
  if (!failed) throw new Error('The import accepted a valuation with no value');
  if (households !== 0) throw new Error(`The import failed but left ${households} household(s) behind`);
  const left = leftover();
  if (left !== 0) throw new Error(`The refused import left ${left} file(s) in Storage`);
  console.log('a refused import left no household and no file in Storage');
}

if (command === 'odd-names' && args[0] !== undefined) await oddDocumentNames(args[0]);
else if (command === 'rollback' && args.length > 0) failedImportLeavesNothing(args);
else if (command === 'refused' && args.length > 0) await refusedImportLeavesNoFiles(args);
else {
  console.error('Usage: tsx scripts/roundtrip-checks.ts odd-names <member email> | rollback <export zip or folder>... | refused <export zip or folder>...');
  process.exit(2);
}
