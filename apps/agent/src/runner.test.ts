import { parseInstant, type Clock } from '@esta/core';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isoDate } from '@esta/core/date';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { A, DOCUMENT_A, EXTRACTION_A, extractJob, JOB_A, NOW, twoHouseholds } from '../test/extract-job';
import { CASES, clockOn, labels, snapshot } from '../test/full-seed';
import { replayWorker } from '../test/replay-worker';
import type { WorkerState } from './heartbeat';
import { JOBS } from './jobs/registry';
import { portfolioWatchRequest } from './jobs/portfolio-watch';
import { recordingSchema, writeRecording } from './replay/store';
import { nextAttempt, pollOnce } from './runner';

const asOf = parseInstant('2026-10-07T09:00:00+07:00');
const error = { kind: 'error', message: 'Overloaded' } as const;

describe('nextAttempt', () => {
  it.each([
    { attempts: 1, runAfter: '2026-10-07T02:01:00.000Z' },
    { attempts: 2, runAfter: '2026-10-07T02:05:00.000Z' },
    { attempts: 3, runAfter: '2026-10-07T02:25:00.000Z' },
  ])('requeues after attempt $attempts at $runAfter', ({ attempts, runAfter }) => {
    expect(nextAttempt({ attempts, max_attempts: 4 }, error, asOf)).toEqual({ status: 'queued', runAfter });
  });

  it('fails the job after the fourth attempt', () => {
    expect(nextAttempt({ attempts: 4, max_attempts: 4 }, error, asOf)).toEqual({ status: 'failed' });
  });

  it('retries a usage limit on the same backoff', () => {
    expect(nextAttempt({ attempts: 1, max_attempts: 4 }, { kind: 'usage_limit', message: 'limit' }, asOf)).toEqual({ status: 'queued', runAfter: '2026-10-07T02:01:00.000Z' });
  });

  it.each(['missing_recording', 'auth_error'] as const)('fails a %s at once, because a retry cannot fix it', (kind) => {
    expect(nextAttempt({ attempts: 1, max_attempts: 4 }, { kind, message: 'x' }, asOf)).toEqual({ status: 'failed' });
  });
});

describe('pollOnce', () => {
  const jobsDir = mkdtempSync(join(tmpdir(), 'esta-runner-'));
  afterEach(() => {
    rmSync(jobsDir, { recursive: true, force: true });
    mkdirSync(jobsDir);
    vi.restoreAllMocks();
  });

  it('fails a crashed last attempt through its failure step: the extraction reads failed, admins get a retry item and the job files go', async () => {
    const { db, tables } = twoHouseholds();
    const extraction = tables.document_extractions.find((row) => row.id === EXTRACTION_A);
    if (extraction === undefined) throw new Error('twoHouseholds has no extraction A');
    extraction.status = 'running';
    const job = { ...extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A }), status: 'running', attempts: 4, max_attempts: 4, locked_by: 'stopped' };
    Object.assign(tables, { agent_jobs: [job] });
    mkdirSync(join(jobsDir, JOB_A));
    writeFileSync(join(jobsDir, JOB_A, 'document.pdf'), 'left by the crashed attempt');
    const worker = replayWorker(db, [job], jobsDir);
    expect(await pollOnce(worker)).toBe(true);
    expect(extraction.status).toBe('failed');
    expect(tables.agent_items).toEqual([expect.objectContaining({ proposal: { type: 'retry_job', params: { job_id: JOB_A }, min_role: 'admin' } })]);
    expect(job).toMatchObject({ status: 'failed', error: 'The worker stopped during the last attempt', finished_at: NOW });
    expect(existsSync(join(jobsDir, JOB_A))).toBe(false);
    expect(await pollOnce(worker)).toBe(false);
  });

  it("requeues an extraction with the database's own message when save_extraction cannot write, instead of blaming the model", async () => {
    const { db, tables } = twoHouseholds([], undefined, { agent_items: 'permission denied for table agent_items' });
    const job = { ...extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A }), status: 'queued' };
    Object.assign(tables, { agent_jobs: [job] });
    expect(await pollOnce(replayWorker(db, [job], jobsDir))).toBe(true);
    expect(job).toMatchObject({ status: 'queued', error: 'Writing the review item failed: permission denied for table agent_items', locked_by: null });
  });

  it('fails a job of an unknown kind at once, because no retry can run it', async () => {
    const { db, tables } = twoHouseholds();
    const job = { ...extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A }), kind: 'mystery', status: 'queued' };
    Object.assign(tables, { agent_jobs: [job] });
    expect(await pollOnce(replayWorker(db, [job], jobsDir))).toBe(true);
    expect(job).toMatchObject({ status: 'failed', error: 'Unknown job kind mystery', finished_at: NOW });
  });

  it('does not report done for a job another worker took over while it ran', async () => {
    const { db, tables } = twoHouseholds();
    const job = { ...extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A }), status: 'queued' };
    Object.assign(tables, { agent_jobs: [job] });
    const worker = replayWorker(db, [job], jobsDir);
    const claim = worker.db.rpc.bind(worker.db);
    Object.assign(worker.db, {
      rpc: async (...args: Parameters<typeof claim>) => {
        const claimed = await claim(...args);
        Object.assign(job, { locked_by: 'w3' });
        return claimed;
      },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(pollOnce(worker)).rejects.toThrow(`job ${JOB_A} is no longer locked by this worker`);
    expect(log.mock.calls.flat().join('\n')).not.toMatch(/: done$/m);
    expect(job).toMatchObject({ status: 'running', locked_by: 'w3' });
  });
});

describe('pollOnce for a portfolio_watch whose session ends as an error', () => {
  const jobsDir = mkdtempSync(join(tmpdir(), 'esta-runner-watch-'));
  const recordings = mkdtempSync(join(tmpdir(), 'esta-runner-auth-'));
  afterEach(() => vi.restoreAllMocks());

  function watchWorker(replayDir: string, attempts: number, clock?: () => Promise<Clock>) {
    const { db, tables } = twoHouseholds();
    const job = { id: JOB_A, household_id: A, kind: 'portfolio_watch', payload: {}, status: 'queued', attempts, max_attempts: 4, idempotency_key: `portfolio_watch:${A}:2026-10-07` };
    Object.assign(tables, { agent_jobs: [job], agent_runs: [] });
    vi.spyOn(JOBS.portfolio_watch.handler, 'prepare').mockImplementation(async ({ db: jobDb, job: claimed }) =>
      portfolioWatchRequest({ db: jobDb, householdId: claimed.household_id, jobId: claimed.id, locale: 'vi', asOf: isoDate('2026-10-07'), timezone: 'Asia/Ho_Chi_Minh', clock: async () => ({ source: 'table', now: () => NOW, today: () => isoDate('2026-10-07') }), read: async () => ({ snapshot, labels }) }),
    );
    const states: WorkerState[] = [];
    return { job, tables, states, worker: replayWorker(db, [job], jobsDir, clock, replayDir, states) };
  }

  it('requeues a usage limit a minute later and tells the heartbeat Trợ lý is paused', async () => {
    const { job, tables, states, worker } = watchWorker(join(CASES, 'usage-limit'), 0);
    expect(await pollOnce(worker)).toBe(true);
    expect(job).toMatchObject({ status: 'queued', attempts: 1, run_after: '2026-10-07T02:01:00.000Z', locked_by: null });
    expect(states).toEqual(['usage_limited']);
    expect(tables.agent_items).toEqual([]);
  });

  it('clears the paused line when the last attempt ends on a usage limit, because nothing waits on it any more (#343)', async () => {
    const { job, tables, states, worker } = watchWorker(join(CASES, 'usage-limit'), 3);
    expect(await pollOnce(worker)).toBe(true);
    expect(job).toMatchObject({ status: 'failed', attempts: 4 });
    expect(states).toEqual(['ok']);
    expect(tables.agent_items).toEqual([expect.objectContaining({ kind: 'alert', proposal: { type: 'retry_job', params: { job_id: JOB_A }, min_role: 'admin' } })]);
  });

  it('fails a rejected login at once, with the Thử lại item for admins and one note for operators that names no error text', async () => {
    const [file = ''] = readdirSync(join(CASES, 'usage-limit', 'portfolio_watch'));
    const usage = recordingSchema.parse(JSON.parse(readFileSync(join(CASES, 'usage-limit', 'portfolio_watch', file), 'utf8')));
    writeRecording(recordings, { ...usage, cause: 'authentication_failed', reply: 'Failed to authenticate. API Error: 401 sk-ant-oat01-secret' });
    const { job, tables, states, worker } = watchWorker(recordings, 0);
    await pollOnce(worker);
    expect(job).toMatchObject({ status: 'failed', attempts: 1 });
    expect(states).toEqual(['ok']);
    expect(tables.agent_items).toEqual([
      expect.objectContaining({ kind: 'alert', audience: 'all', title: 'Trợ lý chưa xem được danh mục hôm nay', proposal: { type: 'retry_job', params: { job_id: JOB_A }, min_role: 'admin' }, dedupe_key: `job_failed:portfolio_watch:2026-10-07:${JOB_A}` }),
      expect.objectContaining({ kind: 'system', severity: 'action', audience: 'operator', title: 'Trợ lý không đăng nhập được vào Claude', dedupe_key: 'auth_error:2026-10-07' }),
    ]);
    expect(JSON.stringify(tables.agent_items)).not.toContain('sk-ant');
  });

  it('keeps the Thử lại item of a run the number guard failed for operators, as its note is', async () => {
    const { job, tables, worker } = watchWorker(join(CASES, 'guard-violation'), 0);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await pollOnce(worker);
    expect(job).toMatchObject({ status: 'failed', attempts: 1 });
    expect(tables.agent_items.map(({ dedupe_key, audience }) => ({ dedupe_key, audience }))).toEqual([
      { dedupe_key: `number_guard:${JOB_A}`, audience: 'operator' },
      { dedupe_key: `job_failed:portfolio_watch:2026-10-07:${JOB_A}`, audience: 'operator' },
    ]);
  });

  it("leaves one Thử lại item after the fourth attempt fails, keyed by the job's kind and its own day so Thị trường can name a failed scan (#329), and none before it", async () => {
    const third = watchWorker(join(CASES, 'always-fail'), 2);
    await pollOnce(third.worker);
    expect(third.job).toMatchObject({ status: 'queued', attempts: 3, run_after: '2026-10-07T02:25:00.000Z' });
    expect(third.tables.agent_items).toEqual([]);

    const last = watchWorker(join(CASES, 'always-fail'), 3);
    await pollOnce(last.worker);
    expect(last.job).toMatchObject({ status: 'failed', attempts: 4, error: 'API Error: 529 Overloaded' });
    expect(last.tables.agent_items).toEqual([expect.objectContaining({ severity: 'info', audience: 'all', dedupe_key: `job_failed:portfolio_watch:2026-10-07:${JOB_A}`, job_id: JOB_A, created_at: NOW })]);
    expect(last.states).toEqual(['ok']);
  });

  it("keys the Thử lại item by the job's own day, so a watch for 07/10 that fails for good at 00:05 on 08/10 is not 08/10's failure (#329)", async () => {
    const late = watchWorker(join(CASES, 'always-fail'), 3, clockOn('2026-10-08T00:05:00+07:00'));
    await pollOnce(late.worker);
    expect(late.job).toMatchObject({ status: 'failed', attempts: 4 });
    expect(late.tables.agent_items).toEqual([expect.objectContaining({ dedupe_key: `job_failed:portfolio_watch:2026-10-07:${JOB_A}`, created_at: '2026-10-07T17:05:00.000Z' })]);
  });
});
