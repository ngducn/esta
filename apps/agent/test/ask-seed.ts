import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fakeDb, type FakeRpcs, type Recorded } from '../src/test/fake-db';
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
    conversations: [{ id: CONVERSATION, household_id: HOUSEHOLD, sdk_session_id: null, sdk_turn_hash: null, sdk_handles: 0 }],
    messages: [
      { id: QUESTION, household_id: HOUSEHOLD, conversation_id: CONVERSATION, role: 'user', content_md: question, status: 'done' },
      { id: ANSWER, household_id: HOUSEHOLD, conversation_id: CONVERSATION, role: 'assistant', content_md: '', status: 'streaming', refs: [] },
    ],
  };
}

/** `finish_answer` as SQL runs it: the streaming answer reads done, and its conversation takes the turn's session. */
export function askRpcs(tables: Record<string, Row[]>, writes: Recorded[] = []): FakeRpcs {
  return {
    finish_answer(args) {
      const answer = tables.messages?.find((row) => row.household_id === args.p_household_id && row.id === args.p_answer_id && row.role === 'assistant' && row.status === 'streaming');
      if (answer === undefined) throw new Error('ESTA_ANSWER_NOT_STREAMING');
      const done = { content_md: args.p_content, refs: args.p_refs, status: 'done' };
      Object.assign(answer, done);
      writes.push({ table: 'messages', op: 'update', row: done });
      const conversation = tables.conversations?.find((row) => row.household_id === args.p_household_id && row.id === answer.conversation_id);
      Object.assign(conversation ?? {}, { sdk_session_id: args.p_session_id ?? null, sdk_turn_hash: args.p_turn_hash ?? null, sdk_handles: args.p_handles });
      return null;
    },
  };
}

export function askWorker(tables: Record<string, Row[]>, jobsDir: string, replayDir = DEFAULT_REPLAY_DIR) {
  const writes: Recorded[] = [];
  const worker = replayWorker(fakeDb(tables, writes, {}, {}, askRpcs(tables, writes)), tables.agent_jobs ?? [], jobsDir, clockOn('2026-10-07T07:00:00+07:00'), replayDir);
  return { worker, writes };
}

export const answerRow = (tables: Record<string, Row[]>) => tables.messages?.find((row) => row.id === ANSWER) as { content_md: string; status: string; refs: string[] };

export const ARCHIVED_PROPERTY = '00000000-0000-4000-8000-0000000a7c01';
const DI_AN = '93cc970b-f9c2-52f5-bc34-1f1edb76742c';

/** The ask tables plus an archived property that still has October income and an expense, which no household figure counts. */
export function withArchivedProperty(tables: Record<string, Row[]>): Record<string, Row[]> {
  const of = { household_id: HOUSEHOLD, property_id: ARCHIVED_PROPERTY };
  (tables.properties ??= []).push({ id: ARCHIVED_PROPERTY, household_id: HOUSEHOLD, code: 'CU', nickname: 'Nhà cũ Demo', kind: 'townhouse', use_mode: 'rental', legal_status: 'certified', current_address: null, deleted_at: '2026-09-01T00:00:00+07:00' });
  (tables.allocation_facts ??= []).push({ ...of, amount_vnd: 7_000_000, received_on: '2026-10-03', payment_id: '00000000-0000-4000-8000-0000000a7c02', invoice_id: '00000000-0000-4000-8000-0000000a7c03' });
  (tables.expenses ??= []).push({ ...of, id: '00000000-0000-4000-8000-0000000a7c04', amount_vnd: 900_000, category: 'repair', paid_on: '2026-10-04', deleted_at: null });
  return tables;
}

const extraLease = (id: string, fields: Row): Row => ({
  id,
  unit: 'Toàn bộ',
  unit_id: `${id.slice(0, -1)}9`,
  tenant: null,
  start_date: '2026-10-20',
  end_date: '2026-11-15',
  rent_vnd: 5_000_000,
  rent_display: '5.000.000 ₫',
  deposit_vnd: 5_000_000,
  deposit_display: '5.000.000 ₫',
  paid_through_date: null,
  held_deposit_vnd: 5_000_000,
  held_deposit_display: '5.000.000 ₫',
  ...fields,
});

/**
 * The recorded reads plus a draft lease with a deposit taken and an active lease on an archived property, both ending
 * within 60 days, which no lease list or deposit total on the screens shows.
 */
export function withDraftAndArchivedLeases(recorded: Record<string, unknown>): Record<string, unknown> {
  const leases = recorded['leases[]'] as Row[];
  return {
    ...recorded,
    'leases[]': [
      ...leases,
      extraLease('00000000-0000-4000-8000-0000000a7c11', { property_id: DI_AN, property: 'Dãy trọ Dĩ An', unit: 'Phòng 8', status: 'draft', property_archived: false }),
      extraLease('00000000-0000-4000-8000-0000000a7c21', { property_id: ARCHIVED_PROPERTY, property: 'Nhà cũ Demo', status: 'active', start_date: '2026-01-01', property_archived: true }),
    ],
  };
}
