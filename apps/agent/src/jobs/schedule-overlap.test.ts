import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JOBS, PLAIN_JOBS } from './registry';

const ICT_OFFSET_MINUTES = 7 * 60;
const DAY = 24 * 60;

type Window = { readonly name: string; readonly start: number; readonly minutes: number };

const { crons } = z
  .object({ crons: z.array(z.object({ path: z.string(), schedule: z.string() })) })
  .parse(JSON.parse(readFileSync(join(import.meta.dirname, '../../../../vercel.json'), 'utf8')));

/** The keep-alive reads one row and writes nothing, so it may run beside any job. */
const KEEP_ALIVE = '/api/cron/keep-alive';

/** A daily cron on the Hobby plan fires anywhere inside its UTC hour, so its window is the whole hour, read in Asia/Ho_Chi_Minh. */
const cronWindows: Window[] = crons.filter(({ path }) => path !== KEEP_ALIVE).map(({ path, schedule }) => {
  const [, hour] = schedule.split(' ');
  return { name: path, start: (Number(hour) * 60 + ICT_OFFSET_MINUTES) % DAY, minutes: 60 };
});

/** A scheduled worker job holds the night from its business time until its timeout. */
const jobWindows: Window[] = [...Object.values(JOBS), ...Object.values(PLAIN_JOBS)].flatMap((spec) => {
  const schedule = 'schedule' in spec ? spec.schedule : undefined;
  if (schedule === undefined) return [];
  const [hour, minute] = schedule.at.split(':').map(Number);
  return [{ name: spec.kind, start: (hour ?? 0) * 60 + (minute ?? 0), minutes: Math.ceil(spec.timeoutMs / 60_000) }];
});

/** The two invoice jobs share an hour on purpose: they run twelve minutes apart and the second reads the first's leases. */
const SHARE_AN_HOUR = new Set(['/api/cron/lease-status|/api/cron/invoices']);

function overlap(a: Window, b: Window): boolean {
  return [-DAY, 0, DAY].some((shift) => a.start < b.start + shift + b.minutes && b.start + shift < a.start + a.minutes);
}

describe('scheduled jobs', () => {
  it('reads the cron hours and the worker times it compares', () => {
    expect(cronWindows.map((w) => w.name)).toContain('/api/cron/document-sweep');
    expect(jobWindows.map((w) => w.name)).toContain('backup_export');
  });

  it('never run in overlapping windows, so the sweep cannot delete files while the backup copies them', () => {
    const all = [...cronWindows, ...jobWindows];
    const clashes = all.flatMap((a, i) =>
      all.slice(i + 1).flatMap((b) => (overlap(a, b) && !SHARE_AN_HOUR.has(`${a.name}|${b.name}`) ? [`${a.name} and ${b.name}`] : [])),
    );
    expect(clashes).toEqual([]);
  });
});
