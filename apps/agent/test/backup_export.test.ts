import { parseInstant } from '@esta/core';
import { isoDate, type IsoDate } from '@esta/core/date';
import { addDays } from '@esta/core/date/calendar';
import { dirSink } from '@esta/db/export';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pollOnce } from '../src/runner';
import { A, JOB_A, twoHouseholds } from './extract-job';
import { replayWorker } from './replay-worker';
import { BACKUP_KEEP_DAYS, EXPORT_KEEP_HOURS, sweepExports, writeBackup, type ExportsStore } from '../src/jobs/backup_export';

const HOUSEHOLD = 'aaaaaaaa-0000-5000-8000-000000000006';
const OTHER = 'bbbbbbbb-0000-5000-8000-000000000007';
const TODAY = isoDate('2026-10-08');
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'esta-backup-test-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const folders = (household = HOUSEHOLD) => (existsSync(join(root, household)) ? readdirSync(join(root, household)).toSorted() : []);

function seedDays(count: number, household = HOUSEHOLD, newest = addDays(TODAY, -1)) {
  for (let back = 0; back < count; back += 1) {
    const dir = join(root, household, addDays(newest, -back));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), '{}');
  }
}

let writes = 0;
const backup = (date: IsoDate = TODAY, household = HOUSEHOLD) =>
  writeBackup({
    root,
    householdId: household,
    date,
    write: async (sink) => {
      writes += 1;
      await sink.add('tables/properties.json', new TextEncoder().encode('[]\n'));
      await sink.add('files/documents/scan.pdf', new Uint8Array([1, 2, 3]));
      await sink.finish((parts) => new TextEncoder().encode(JSON.stringify({ parts, complete: true })));
    },
  });

describe('writeBackup', () => {
  beforeEach(() => {
    writes = 0;
  });

  it('writes the manifest, the tables and the files into ESTA_BACKUP_DIR/{household}/{date}', async () => {
    const result = await backup();
    expect(result.created).toBe(true);
    expect(folders()).toEqual(['2026-10-08']);
    const dir = join(root, HOUSEHOLD, '2026-10-08');
    expect(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))).toEqual({ parts: ['2026-10-08'], complete: true });
    expect([...readFileSync(join(dir, 'files/documents/scan.pdf'))]).toEqual([1, 2, 3]);
    expect(existsSync(join(dir, 'tables/properties.json'))).toBe(true);
  });

  it('writes no second folder and reads nothing again when it runs twice on one date', async () => {
    await backup();
    const again = await backup();
    expect(again.created).toBe(false);
    expect(writes).toBe(1);
    expect(folders()).toEqual(['2026-10-08']);
  });

  it('leaves no folder behind when the export fails halfway, so the rerun writes it', async () => {
    await expect(
      writeBackup({
        root,
        householdId: HOUSEHOLD,
        date: TODAY,
        write: async (sink) => {
          await sink.add('tables/a.json', new Uint8Array([1]));
          throw new Error('Reading properties failed');
        },
      }),
    ).rejects.toThrow('Reading properties failed');
    expect(folders()).toEqual([]);
    expect((await backup()).created).toBe(true);
    expect(folders()).toEqual(['2026-10-08']);
  });

  it('shrinks 31 dated folders to 30 by dropping the oldest', async () => {
    seedDays(31);
    expect(folders()).toHaveLength(31);
    const result = await backup();
    expect(BACKUP_KEEP_DAYS).toBe(30);
    expect(folders()).toHaveLength(30);
    expect(folders()[0]).toBe('2026-09-09');
    expect(folders().at(-1)).toBe('2026-10-08');
    expect(result.pruned).toEqual(['2026-09-07', '2026-09-08']);
  });

  it('keeps a folder exactly 29 days old and drops one 30 days old', async () => {
    seedDays(1, HOUSEHOLD, addDays(TODAY, -29));
    seedDays(1, HOUSEHOLD, addDays(TODAY, -30));
    await backup();
    expect(folders()).toEqual(['2026-09-09', '2026-10-08']);
  });

  it('never deletes a folder whose name is not a date, nor a file', async () => {
    seedDays(31);
    for (const name of ['notes', '2026-13-45', '2026-09-01-old', '.2026-09-01', 'latest']) mkdirSync(join(root, HOUSEHOLD, name));
    writeFileSync(join(root, HOUSEHOLD, '2026-01-01'), 'a file named like an old date');
    await backup();
    expect(folders()).toEqual(expect.arrayContaining(['.2026-09-01', '2026-01-01', '2026-09-01-old', '2026-13-45', 'latest', 'notes']));
    expect(folders().filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name) && statDir(name))).toHaveLength(30);
  });

  it('never touches another household or anything outside its own folder', async () => {
    seedDays(31, OTHER);
    writeFileSync(join(root, 'README'), 'keep');
    seedDays(31);
    await backup();
    expect(folders(OTHER)).toHaveLength(31);
    expect(readFileSync(join(root, 'README'), 'utf8')).toBe('keep');
  });

  it('prunes even when today already has its folder, and prunes nothing when the export fails', async () => {
    seedDays(31);
    mkdirSync(join(root, HOUSEHOLD, '2026-10-08'));
    expect((await backup()).created).toBe(false);
    expect(folders()).toHaveLength(30);

    seedDays(5, HOUSEHOLD, addDays(TODAY, -40));
    const before = folders();
    await expect(writeBackup({ root, householdId: HOUSEHOLD, date: addDays(TODAY, 1), write: async () => Promise.reject(new Error('down')) })).rejects.toThrow('down');
    expect(folders()).toEqual(before);
  });

  it('dates the folder from the job, so a retry after midnight still fills the day it was queued for', async () => {
    await backup(isoDate('2026-10-07'));
    expect(folders()).toEqual(['2026-10-07']);
  });

  it('refuses a household id that would leave its folder', async () => {
    await expect(backup(TODAY, '../outside')).rejects.toThrow(/household/);
    expect(existsSync(join(root, '..', 'outside'))).toBe(false);
  });
});

function statDir(name: string): boolean {
  return existsSync(join(root, HOUSEHOLD, name, 'manifest.json'));
}

describe('dirSink', () => {
  it('refuses an entry that would be written outside the folder', async () => {
    const sink = dirSink(join(root, 'out'), 'out');
    await expect(sink.add('../escape.txt', new Uint8Array([1]))).rejects.toThrow(/outside/);
    await expect(sink.add('/etc/passwd', new Uint8Array([1]))).rejects.toThrow(/outside/);
    expect(existsSync(join(root, 'escape.txt'))).toBe(false);
  });

  it('streams chunks into one file', async () => {
    const sink = dirSink(join(root, 'out'), 'out');
    async function* chunks() {
      yield new TextEncoder().encode('[1,');
      yield new TextEncoder().encode('2]');
    }
    await sink.add('tables/a.json', chunks());
    expect(readFileSync(join(root, 'out/tables/a.json'), 'utf8')).toBe('[1,2]');
  });
});

describe('sweepExports', () => {
  const NOW = parseInstant('2026-10-08T02:00:00.000Z');
  const hoursAgo = (hours: number) => new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();

  function store(objects: Record<string, string | null>): ExportsStore & { removed: string[] } {
    const removed: string[] = [];
    return {
      removed,
      async *list(prefix) {
        for (const [path, createdAt] of Object.entries(objects)) if (path.startsWith(`${prefix}/`) && !removed.includes(path)) yield { path, createdAt };
      },
      remove: async (paths) => void removed.push(...paths),
    };
  }

  it('deletes ZIPs older than 24 hours and keeps younger ones', async () => {
    const exports = store({
      [`${HOUSEHOLD}/old.zip`]: hoursAgo(25),
      [`${HOUSEHOLD}/old-part-2.zip`]: hoursAgo(24.01),
      [`${HOUSEHOLD}/edge.zip`]: hoursAgo(24),
      [`${HOUSEHOLD}/fresh.zip`]: hoursAgo(23.9),
      [`${HOUSEHOLD}/new.zip`]: hoursAgo(0.1),
    });
    expect(EXPORT_KEEP_HOURS).toBe(24);
    const swept = await sweepExports(exports, HOUSEHOLD, NOW);
    expect(exports.removed.toSorted()).toEqual([`${HOUSEHOLD}/old-part-2.zip`, `${HOUSEHOLD}/old.zip`]);
    expect(swept).toBe(2);
  });

  it('touches only its own household prefix', async () => {
    const exports = store({ [`${HOUSEHOLD}/a.zip`]: hoursAgo(30), [`${OTHER}/b.zip`]: hoursAgo(30) });
    await sweepExports(exports, HOUSEHOLD, NOW);
    expect(exports.removed).toEqual([`${HOUSEHOLD}/a.zip`]);
  });

  it('deletes an object whose age it cannot read, since an unknown age cannot be shown to be young', async () => {
    const exports = store({ [`${HOUSEHOLD}/unknown.zip`]: null });
    await sweepExports(exports, HOUSEHOLD, NOW);
    expect(exports.removed).toEqual([`${HOUSEHOLD}/unknown.zip`]);
  });

  it('deletes nothing when nothing is old', async () => {
    const exports = store({ [`${HOUSEHOLD}/fresh.zip`]: hoursAgo(1) });
    expect(await sweepExports(exports, HOUSEHOLD, NOW)).toBe(0);
    expect(exports.removed).toEqual([]);
  });
});

describe('backup_export as a job the worker polls', () => {
  it('fails at once and leaves admins a retry item when ESTA_BACKUP_DIR is not set, and starts no model session', async () => {
    const { db, tables } = twoHouseholds();
    const job = { id: JOB_A, household_id: A, kind: 'backup_export', payload: {}, status: 'queued', attempts: 0, max_attempts: 4, idempotency_key: `backup_export:${A}:2026-10-07`, created_at: '2026-10-06T19:00:00.000Z' };
    Object.assign(tables, { agent_jobs: [job], agent_runs: [] as Record<string, unknown>[] });
    const states: Parameters<typeof replayWorker>[5] = [];
    expect(await pollOnce(replayWorker(db, [job], root, undefined, undefined, states))).toBe(true);
    expect(job).toMatchObject({ status: 'failed', error: expect.stringContaining('ESTA_BACKUP_DIR is not set') });
    expect(tables.agent_items).toEqual([expect.objectContaining({ title: 'Chưa lưu được bản sao đêm qua', proposal: { type: 'retry_job', params: { job_id: JOB_A }, min_role: 'admin' } })]);
    expect(states).toEqual([]);
  });
});
