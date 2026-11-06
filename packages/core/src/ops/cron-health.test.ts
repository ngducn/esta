import { describe, expect, it } from 'vitest';
import { cronHealth, CRON_JOBS, NIGHTLY_WINDOW_MS, type CronRunRow } from './cron-health';
import type { Instant } from '../clock/clock';

const at = (iso: string) => iso as Instant;
const NOW = at('2026-11-07T02:00:00Z');
const ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString() as Instant;
const HOUR = 3_600_000;

const allFresh = (): CronRunRow[] => CRON_JOBS.map((job) => ({ job, finishedAt: ago(2 * HOUR), ok: true }));

describe('cronHealth', () => {
  it('is fine when every job finished ok inside the window', () => {
    expect(cronHealth(allFresh(), NOW)).toEqual({ kind: 'ok' });
  });

  it('names a job whose latest run failed', () => {
    const rows = allFresh().map((row) => (row.job === 'invoices' ? { ...row, ok: false } : row));
    expect(cronHealth(rows, NOW)).toEqual({ kind: 'attention', failed: ['invoices'], stale: [] });
  });

  it('names a job with no run at all as stale', () => {
    const rows = allFresh().filter((row) => row.job !== 'document_sweep');
    expect(cronHealth(rows, NOW)).toEqual({ kind: 'attention', failed: [], stale: ['document_sweep'] });
  });

  it('is stale after 26 hours and not before', () => {
    const edge = (age: number) => allFresh().map((row) => (row.job === 'keep_alive' ? { ...row, finishedAt: ago(age) } : row));
    expect(NIGHTLY_WINDOW_MS).toBe(26 * HOUR);
    expect(cronHealth(edge(26 * HOUR), NOW)).toEqual({ kind: 'ok' });
    expect(cronHealth(edge(26 * HOUR + 1), NOW)).toEqual({ kind: 'attention', failed: [], stale: ['keep_alive'] });
  });

  it('lists a failed and stale job once, as failed', () => {
    const rows = allFresh().map((row) => (row.job === 'lease_status' ? { ...row, ok: false, finishedAt: ago(40 * HOUR) } : row));
    expect(cronHealth(rows, NOW)).toEqual({ kind: 'attention', failed: ['lease_status'], stale: [] });
  });

  it('does not call a run stale when the test clock sits before it', () => {
    const rows = allFresh().map((row) => ({ ...row, finishedAt: at('2026-11-08T02:00:00Z') }));
    expect(cronHealth(rows, NOW)).toEqual({ kind: 'ok' });
  });

  it('reports every job in the registry order', () => {
    expect(cronHealth([], NOW)).toEqual({ kind: 'attention', failed: [], stale: [...CRON_JOBS] });
  });
});
