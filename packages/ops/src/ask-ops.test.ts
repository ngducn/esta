import { describe, expect, it } from 'vitest';
import { askQuestion } from './ask-ops';
import { runOp } from './op';
import { fakeDb, HOUSEHOLD, opContext as context, type Sent } from './test/fake-db';

const CONVERSATION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c01';
const writes = (sent: readonly Sent[]) => sent.filter((request) => request.method !== 'GET');

describe('askQuestion', () => {
  it('asks through ask_question with the trimmed question and the clock, once per conversation id', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'rpc/ask_question' ? [CONVERSATION] : []));
    expect((await runOp(askQuestion, context(db), { id: CONVERSATION, question: '  Tháng này thu được bao nhiêu từ Dĩ An?  ' })).ok).toBe(true);
    expect(writes(sent).map(({ table, body }) => ({ table, body }))).toEqual([
      {
        table: 'rpc/ask_question',
        body: { p_household_id: HOUSEHOLD, p_conversation_id: CONVERSATION, p_question: 'Tháng này thu được bao nhiêu từ Dĩ An?', p_as_of: '2026-10-07T02:00:00.000Z' },
      },
    ]);
  });

  it('writes nothing when the conversation already exists, so a second tap opens the same answer', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'conversations' ? [{ id: CONVERSATION }] : []));
    expect(await runOp(askQuestion, context(db), { id: CONVERSATION, question: 'Câu hỏi' })).toEqual({ ok: true, value: { id: CONVERSATION } });
    expect(writes(sent)).toEqual([]);
  });

  it.each(['', '   ', 'a'.repeat(2001)])('refuses the question %j before it reaches the database', async (question) => {
    const { db, sent } = fakeDb();
    expect(await runOp(askQuestion, context(db), { id: CONVERSATION, question })).toMatchObject({ ok: false, reason: { kind: 'invalid' } });
    expect(sent).toEqual([]);
  });
});
