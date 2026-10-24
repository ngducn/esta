import { parseInstant } from '@esta/core';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENT_A, EXTRACTION_A, extractJob, JOB_A, NOW, twoHouseholds } from '../test/extract-job';
import { replayWorker } from '../test/replay-worker';
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
