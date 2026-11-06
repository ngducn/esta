import type { Clock, Instant } from '@esta/core';
import { scheduledPeriod } from '@esta/core/agent-schedule';
import { isIsoDate, type IsoDate } from '@esta/core/date';
import { daysBetween } from '@esta/core/date/calendar';
import type { Json } from '@esta/db';
import { dirSink, objectsUnder, writeExport, type ExportSink } from '@esta/ops/export';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readdir, rename, rm } from 'node:fs/promises';
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

const STAGING_NAME = /^\.(\d{4}-\d{2}-\d{2})\.(?:[0-9a-f-]{36}\.)?partial$/;

/**
 * Keeps the newest 30 dated folders: one goes only when 30 newer ones exist and its own date is 30 or more days before
 * this run's, so a clock that jumps ahead or back cannot empty the folder. A folder named anything else is not ours.
 */
async function prune(householdDir: string, today: IsoDate): Promise<string[]> {
  const entries = await readdir(householdDir, { withFileTypes: true });
  const dated = entries.filter((entry) => entry.isDirectory() && isIsoDate(entry.name)).map((entry) => entry.name).toSorted().toReversed();
  const old = dated.slice(BACKUP_KEEP_DAYS).filter((name) => name !== today && isIsoDate(name) && daysBetween(name, today) >= BACKUP_KEEP_DAYS).toSorted();
  for (const name of old) await rm(join(householdDir, name), { recursive: true });
  return old;
}

/** A crash leaves its hidden staging folder, which holds ID photos; a later date's run removes every one of an earlier date and never one of its own date, which may be a run in progress. */
async function removeStaleStaging(householdDir: string, today: IsoDate): Promise<void> {
  for (const entry of await readdir(householdDir, { withFileTypes: true })) {
    const date = entry.isDirectory() ? STAGING_NAME.exec(entry.name)?.[1] : undefined;
    if (date !== undefined && isIsoDate(date) && date < today) await rm(join(householdDir, entry.name), { recursive: true, force: true });
  }
}

/**
 * Writes `{root}/{household}/{date}` once: the export goes to a hidden folder of its own and is renamed whole, so a
 * crash leaves no half-written day for the rerun to mistake for a finished one, and two runs of one date never share
 * a folder. Folders are 0700 and files 0600. Old days go only after the new one is safe.
 */
export async function writeBackup({ root, householdId, date, write }: BackupInput): Promise<BackupResult> {
  if (!z.uuid().safeParse(householdId).success) throw new Error(`Refusing to back up "${householdId}": it is not a household id`);
  const householdDir = join(root, householdId);
  const final = join(householdDir, date);
  let created = !existsSync(final);
  await mkdir(householdDir, { recursive: true, mode: 0o700 });
  await chmod(householdDir, 0o700);
  await removeStaleStaging(householdDir, date);
  if (created) {
    const staging = join(householdDir, `.${date}.${randomUUID()}.partial`);
    await mkdir(staging, { mode: 0o700 });
    try {
      await write(dirSink(staging, date));
      await rename(staging, final);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      if (!existsSync(final)) throw error;
      created = false;
    }
  }
  return { created, pruned: await prune(householdDir, date) };
}

export type ExportsStore = {
  list(prefix: string): AsyncIterable<{ readonly path: string; readonly createdAt: string | null }>;
  remove(paths: readonly string[]): Promise<void>;
};

function exportsStore(db: AgentDb): ExportsStore {
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
  const date = backupDate(job, clock);
  let totals = { rows: 0, files: 0 };
  let failure: unknown = null;
  let pruned: readonly string[] = [];
  let created = false;
  try {
    if (backupDir === null) throw new InvalidJobError('ESTA_BACKUP_DIR is not set, so there is nowhere to write the backup');
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
