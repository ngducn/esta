import { isoDate, parseInstant, type Clock } from '@esta/core';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareExtractDocument } from '../src/jobs/extract-document';
import { JOBS, type AgentJob } from '../src/jobs/registry';
import { canonicalizer } from '../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR } from '../src/replay/store';
import { replaySession } from '../src/sdk/session';
import { fakeDb, type Recorded } from '../src/test/fake-db';

export const A = 'aaaaaaaa-0000-5000-8000-000000000001';
export const B = 'bbbbbbbb-0000-5000-8000-000000000002';
export const DOCUMENT_A = 'aaaaaaaa-0000-5000-8000-0000000000d1';
export const DOCUMENT_B = 'bbbbbbbb-0000-5000-8000-0000000000d2';
export const EXTRACTION_A = 'aaaaaaaa-0000-5000-8000-0000000000e1';
export const EXTRACTION_B = 'bbbbbbbb-0000-5000-8000-0000000000e2';
export const JOB_A = 'aaaaaaaa-0000-5000-8000-0000000000f1';

export const newJobDir = (): string => realpathSync(mkdtempSync(join(tmpdir(), 'esta-extract-test-')));

/** A frozen test clock far from the database's real time, so a row dated by now() instead fails the test. */
export const NOW = parseInstant('2026-10-07T09:00:00+07:00');
export const clock = (): Promise<Clock> => Promise.resolve({ source: 'table', now: () => NOW, today: () => isoDate('2026-10-07') });

const SCAN = readFileSync(join(import.meta.dirname, '../../../fixtures/certificates/gcn_2009_2024-scan/document.pdf'));

/** Two households with one certificate each, as the service client sees them. */
export function twoHouseholds(writes: Recorded[] = [], titleA = 'Sổ hồng Bảo Lộc', refuse: Record<string, string> = {}) {
  const tables = {
    households: [
      { id: A, name: 'Gia đình Demo 1', locale: 'vi' },
      { id: B, name: 'Gia đình Demo 2', locale: 'vi' },
    ],
    documents: [
      { id: DOCUMENT_A, household_id: A, title: titleA, storage_path: `${A}/${DOCUMENT_A}/so-hong.pdf`, mime: 'application/pdf' },
      { id: DOCUMENT_B, household_id: B, title: 'Sổ hồng B', storage_path: `${B}/${DOCUMENT_B}/so-hong.pdf`, mime: 'application/pdf' },
    ],
    document_extractions: [
      { id: EXTRACTION_A, household_id: A, document_id: DOCUMENT_A, schema_name: 'certificate_v1', job_id: JOB_A, status: 'queued' },
      { id: EXTRACTION_B, household_id: B, document_id: DOCUMENT_B, schema_name: 'certificate_v1', job_id: 'other-job', status: 'queued' },
    ],
    agent_items: [] as Record<string, unknown>[],
  };
  const files = { [`documents/${A}/${DOCUMENT_A}/so-hong.pdf`]: SCAN, [`documents/${B}/${DOCUMENT_B}/so-hong.pdf`]: SCAN };
  return { tables, db: fakeDb(tables, writes, files, refuse) };
}

export const extractJob = (payload: { document_id: string; extraction_id: string }, householdId = A): AgentJob =>
  ({ id: JOB_A, household_id: householdId, kind: 'extract_document', payload, attempts: 1, max_attempts: 4 }) as unknown as AgentJob;

/** The worker's steps for one attempt in replay; `crash` stops after the session, before `finish`, as a killed worker would. */
export async function attempt(db: ReturnType<typeof fakeDb>, job: AgentJob, { crash = false } = {}) {
  const jobDir = newJobDir();
  try {
    const prepared = await prepareExtractDocument({ db, job, jobDir, timezone: 'Asia/Ho_Chi_Minh', waiting: [], clock });
    const run = await replaySession(
      { spec: JOBS.extract_document, prompt: prepared.prompt, jobDir, configDir: jobDir, tools: prepared.tools, canon: canonicalizer({ householdName: 'Gia đình Demo 1', jobDir }) },
      DEFAULT_REPLAY_DIR,
    );
    return { run, result: crash ? null : await prepared.finish({ reply: run.result.text, model: run.model }) };
  } finally {
    rmSync(jobDir, { recursive: true, force: true });
  }
}
