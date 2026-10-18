import { parseInstant } from '@esta/core';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clock, DOCUMENT_A, EXTRACTION_A, extractJob, JOB_A, NOW, twoHouseholds } from '../test/extract-job';
import { nextAttempt, pollOnce, type Worker } from './runner';

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

describe('pollOnce after a crash on the last attempt', () => {
  it('fails the job through its failure step: the extraction reads failed, admins get a retry item and the job files go', async () => {
    const { db, tables } = twoHouseholds();
    const extraction = tables.document_extractions.find((row) => row.id === EXTRACTION_A);
    if (extraction === undefined) throw new Error('twoHouseholds has no extraction A');
    extraction.status = 'running';
    const job = { ...extractJob({ document_id: DOCUMENT_A, extraction_id: EXTRACTION_A }), status: 'running', attempts: 4, max_attempts: 4, locked_by: 'stopped' };
    const jobs: Record<string, unknown>[] = [job];
    Object.assign(tables, { agent_jobs: jobs });
    const rpc = async (name: string, args: { worker_id: string; p_as_of: string }) => {
      if (name !== 'claim_abandoned_agent_job') return { data: [], error: null };
      const abandoned = jobs.filter((row) => row.status === 'running' && row.locked_by === 'stopped');
      for (const row of abandoned) Object.assign(row, { locked_by: args.worker_id, locked_at: args.p_as_of });
      return { data: abandoned, error: null };
    };
    const jobsDir = mkdtempSync(join(tmpdir(), 'esta-runner-'));
    mkdirSync(join(jobsDir, JOB_A));
    writeFileSync(join(jobsDir, JOB_A, 'document.pdf'), 'left by the crashed attempt');
    const worker = { db: Object.assign(db, { rpc }), workerId: 'w2', jobsDir, configDir: jobsDir, replayDir: jobsDir, clock } as unknown as Worker;
    try {
      expect(await pollOnce(worker)).toBe(true);
      expect(extraction.status).toBe('failed');
      expect(tables.agent_items).toEqual([expect.objectContaining({ proposal: { type: 'retry_job', params: { job_id: JOB_A }, min_role: 'admin' } })]);
      expect(job).toMatchObject({ status: 'failed', error: 'The worker stopped during the last attempt', finished_at: NOW });
      expect(existsSync(join(jobsDir, JOB_A))).toBe(false);
      expect(await pollOnce(worker)).toBe(false);
    } finally {
      rmSync(jobsDir, { recursive: true, force: true });
    }
  });
});
