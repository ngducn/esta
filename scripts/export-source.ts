import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { unzipSync } from 'fflate';
import { z } from 'zod';
import { EXPORT_TABLES } from '../packages/core/src/export/tables.ts';
import { parseSlot, slotPorts, slotWorkdir } from './slot.ts';
import { slotEnv } from './slot-env.ts';

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  householdId: z.uuid(),
  tables: z.record(z.string(), z.number().int().nonnegative()),
  files: z.number().int().nonnegative(),
  parts: z.array(z.string()).min(1),
});
export type Manifest = z.infer<typeof manifestSchema>;

export type ExportSource = {
  readonly manifest: Manifest;
  readonly tables: ReadonlyMap<string, Record<string, unknown>[]>;
  /** `files/` entries by path under it: `<bucket>/<household id>/...`. */
  readonly files: ReadonlyMap<string, Uint8Array>;
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const rowsSchema = z.array(z.record(z.string(), z.unknown()));

/** An import writes with the service role and skips every trigger, so it runs only against a database on this machine. */
export function assertLocal(label: string, rawUrl: string): void {
  const host = new URL(rawUrl).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`${label} points at ${host}; an import runs only against a local database`);
}

function readEntries(path: string): Map<string, Uint8Array> {
  if (statSync(path).isFile()) return new Map(Object.entries(unzipSync(new Uint8Array(readFileSync(path)))));
  const entries = new Map<string, Uint8Array>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.zip')) for (const [entry, bytes] of readEntries(full)) entries.set(entry, bytes);
      else entries.set(relative(path, full).split('\\').join('/'), new Uint8Array(readFileSync(full)));
    }
  };
  walk(path);
  return entries;
}

/** An export as a ZIP, as the folder it unzips to, or as the several ZIPs of a large one. */
export function readExport(paths: readonly string[]): ExportSource {
  const entries = new Map<string, Uint8Array>();
  for (const path of paths) for (const [entry, bytes] of readEntries(path)) entries.set(entry, bytes);
  const manifestBytes = entries.get('manifest.json');
  if (manifestBytes === undefined) throw new Error('No manifest.json: pass the last part of the export too');
  const manifest = manifestSchema.parse(JSON.parse(new TextDecoder().decode(manifestBytes)));
  const given = new Set(paths.map((path) => basename(path)));
  const missing = paths.every((path) => path.endsWith('.zip')) ? manifest.parts.filter((part) => !given.has(part)) : [];
  if (missing.length > 0) throw new Error(`The manifest lists parts that were not given: ${missing.join(', ')}`);
  const tables = new Map(
    EXPORT_TABLES.map(({ name }) => {
      const bytes = entries.get(`tables/${name}.json`);
      if (bytes === undefined) throw new Error(`tables/${name}.json is missing from the export`);
      return [name, rowsSchema.parse(JSON.parse(new TextDecoder().decode(bytes)))] as const;
    }),
  );
  const files = new Map([...entries].filter(([entry]) => entry.startsWith('files/')).map(([entry, bytes]) => [entry.slice('files/'.length), bytes] as const));
  return { manifest, tables, files };
}

export type TargetDatabase = { readonly slot: number; readonly dbUrl: string; readonly apiUrl: string; readonly serviceKey: string };

/** The slot's database and Storage, refused unless both are local. */
export function localTarget(): TargetDatabase {
  const slot = parseSlot(process.env.ESTA_SLOT);
  const env = slotEnv(join(import.meta.dirname, '..'), slot);
  const dbUrl = process.env.SUPABASE_DB_URL ?? `postgresql://postgres:postgres@127.0.0.1:${slotPorts(slot).db}/postgres`;
  const apiUrl = env.SUPABASE_URL ?? `http://127.0.0.1:${slotPorts(slot).api}`;
  assertLocal('SUPABASE_DB_URL', dbUrl);
  assertLocal('SUPABASE_URL', apiUrl);
  return { slot, dbUrl, apiUrl, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '' };
}

/** Runs SQL over the connection string with the Supabase CLI, which sends a `--file` as one script. The slot's workdir makes it treat this database as local and skip TLS. */
export function runSql<Row>(dbUrl: string, sql: string, { file = false } = {}): Row[] {
  const args = file ? ['--file', sql] : [sql];
  const workdir = slotWorkdir(join(import.meta.dirname, '..'), parseSlot(process.env.ESTA_SLOT));
  const result = spawnSync('supabase', ['db', 'query', '--workdir', workdir, '--db-url', dbUrl, '--agent=no', '-o', 'json', ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`supabase db query failed:\n${result.stderr}`);
  return result.stdout.trimStart().startsWith('[') ? (JSON.parse(result.stdout) as Row[]) : [];
}
