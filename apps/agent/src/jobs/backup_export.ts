import type { Clock, Instant } from '@esta/core';
import { scheduledPeriod } from '@esta/core/agent-schedule';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { daysBetween } from '@esta/core/date/calendar';
import type { Json } from '@esta/db';
import { dirSink, objectsUnder, writeExport, type ExportSink } from '@esta/db/export';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { AgentDb } from '../supabase';
import { InvalidJobError } from './extract-document';
import type { PlainJobContext } from './registry';

export const BACKUP_KEEP_DAYS = 30;
export const EXPORT_KEEP_HOURS = 24;
const EXPORTS_BUCKET = 'exports';
const REMOVE_BATCH = 100;

export type BackupInput = {
  readonly root: string;
  readonly householdId: string;
  readonly date: IsoDate;
  /** Fills the sink the way `writeExport` does; the job passes the real export, a test a small one. */
  write(sink: ExportSink): Promise<unknown>;
};

export type BackupResult = { readonly created: boolean; readonly pruned: readonly string[] };

/** Folders older than the last 30 days, judged by the date in their name; a folder named anything else is not ours to delete. */
async function prune(householdDir: string, today: IsoDate): Promise<string[]> {
  const entries = await readdir(householdDir, { withFileTypes: true });
  const old = entries.filter((entry) => entry.isDirectory() && isIsoDate(entry.name) && daysBetween(entry.name, today) >= BACKUP_KEEP_DAYS).map((entry) => entry.name).toSorted();
  for (const name of old) await rm(join(householdDir, name), { recursive: true });
  return old;
}

/**
 * Writes `{root}/{household}/{date}` once: the export goes to a hidden folder and is renamed whole, so a crash leaves no
 * half-written day for the rerun to mistake for a finished one. Old days go only after the new one is safe.
 */
export async function writeBackup({ root, householdId, date, write }: BackupInput): Promise<BackupResult> {
  if (!z.uuid().safeParse(householdId).success) throw new Error(`Refusing to back up "${householdId}": it is not a household id`);
  const householdDir = join(root, householdId);
  const final = join(householdDir, date);
  const created = !existsSync(final);
  if (created) {
    const staging = join(householdDir, `.${date}.partial`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    try {
      await write(dirSink(staging, date));
      await rename(staging, final);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }
  return { created, pruned: await prune(householdDir, date) };
}

export type ExportsStore = {
  list(prefix: string): AsyncIterable<{ readonly path: string; readonly createdAt: string | null }>;
  remove(paths: readonly string[]): Promise<void>;
};

export function exportsStore(db: AgentDb): ExportsStore {
  return {
    async *list(prefix) {
      for await (const object of objectsUnder(db, EXPORTS_BUCKET, prefix)) yield { path: object.path, createdAt: object.createdAt };
    },
    async remove(paths) {
      const { error } = await db.storage.from(EXPORTS_BUCKET).remove([...paths]);
      if (error) throw new Error(`Deleting old exports failed: ${error.message}`);
    },
  };
}

/** A finished ZIP holds ID photos and any admin session can sign it again, so none stays past a day. An age that cannot be read counts as old. */
export async function sweepExports(store: ExportsStore, householdId: string, now: Instant): Promise<number> {
  const cutoff = Date.parse(now) - EXPORT_KEEP_HOURS * 3_600_000;
  const old: string[] = [];
  for await (const { path, createdAt } of store.list(householdId)) if (createdAt === null || !(Date.parse(createdAt) >= cutoff)) old.push(path);
  for (let start = 0; start < old.length; start += REMOVE_BATCH) await store.remove(old.slice(start, start + REMOVE_BATCH));
  return old.length;
}

const SERVICE = { role: 'service', isOperator: true } as const;

/** The folder is dated by the day the job was queued for, never by the day it runs, so a retry after midnight fills the right day (AGENT.md §3). */
function backupDate(job: PlainJobContext['job'], clock: Clock): IsoDate {
  const period = scheduledPeriod(job.idempotency_key);
  return period !== null && isIsoDate(period) ? period : clock.today();
}

export async function runBackupExport({ db, job, clock, backupDir }: PlainJobContext): Promise<Json> {
  if (backupDir === null) throw new InvalidJobError('ESTA_BACKUP_DIR is not set, so there is nowhere to write the backup');
  const date = backupDate(job, clock);
  let totals = { rows: 0, files: 0 };
  let failure: unknown = null;
  let pruned: readonly string[] = [];
  let created = false;
  try {
    ({ created, pruned } = await writeBackup({
      root: backupDir,
      householdId: job.household_id,
      date,
      write: async (sink) => {
        const { manifest } = await writeExport(db, job.household_id, sink, { clock, exporter: SERVICE, complete: true });
        totals = { rows: Object.values(manifest.tables).reduce((sum, rows) => sum + rows, 0), files: manifest.files };
      },
    }));
  } catch (error) {
    failure = error;
  }
  const swept = await sweepExports(exportsStore(db), job.household_id, clock.now()).catch((error: unknown) => {
    failure ??= error;
    return 0;
  });
  if (failure !== null) throw failure instanceof Error ? failure : new Error(String(failure));
  return { date, created, ...totals, pruned: [...pruned], swept };
}
