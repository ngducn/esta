import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeDb, type Recorded } from '../src/test/fake-db';
import { HOUSEHOLD } from './full-seed';
import { replayWorker } from './replay-worker';
import { clockOn } from './full-seed';
import { DEFAULT_REPLAY_DIR } from '../src/replay/store';

type Row = Record<string, unknown>;

export const CONVERSATION = '00000000-0000-4000-8000-0000000c0a01';
export const QUESTION = '00000000-0000-4000-8000-0000000c0a02';
export const ANSWER = '00000000-0000-4000-8000-0000000c0a03';
export const ASK_JOB = '00000000-0000-4000-8000-0000000c0a04';

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'golden/ask-full-2026-10-07.json'), 'utf8')) as Record<string, Row[]>;

export function askTables(question: string, payload: Row = { conversation_id: CONVERSATION, question_id: QUESTION, answer_id: ANSWER }): Record<string, Row[]> {
  return {
    ...structuredClone(fixture),
    households: [{ id: HOUSEHOLD, name: 'Gia đình Demo', locale: 'vi' }],
    agent_items: [],
    agent_runs: [],
    agent_jobs: [{ id: ASK_JOB, household_id: HOUSEHOLD, kind: 'ask', status: 'queued', attempts: 0, max_attempts: 4, run_after: '2026-10-07T00:00:00.000Z', payload }],
    messages: [
      { id: QUESTION, household_id: HOUSEHOLD, conversation_id: CONVERSATION, role: 'user', content_md: question, status: 'done' },
      { id: ANSWER, household_id: HOUSEHOLD, conversation_id: CONVERSATION, role: 'assistant', content_md: '', status: 'streaming', refs: [] },
    ],
  };
}

export function askWorker(tables: Record<string, Row[]>, jobsDir: string, replayDir = DEFAULT_REPLAY_DIR) {
  const writes: Recorded[] = [];
  const worker = replayWorker(fakeDb(tables, writes), tables.agent_jobs ?? [], jobsDir, clockOn('2026-10-07T07:00:00+07:00'), replayDir);
  return { worker, writes };
}

export const answerRow = (tables: Record<string, Row[]>) => tables.messages?.find((row) => row.id === ANSWER) as { content_md: string; status: string; refs: string[] };
