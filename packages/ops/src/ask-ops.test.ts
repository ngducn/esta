import { describe, expect, it } from 'vitest';
import { askQuestion } from './ask-ops';
import { runOp } from './op';
import { fakeDb, HOUSEHOLD, opContext as context, type Sent } from './test/fake-db';

const CONVERSATION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c01';
const QUESTION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c02';
const writes = (sent: readonly Sent[]) => sent.filter((request) => request.method !== 'GET');

describe('askQuestion', () => {
  it('asks through ask_question with the trimmed question, its id and the clock', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'rpc/ask_question' ? [CONVERSATION] : []));
    expect((await runOp(askQuestion, context(db), { id: CONVERSATION, questionId: QUESTION, question: '  Tháng này thu được bao nhiêu từ Dĩ An?  ' })).ok).toBe(true);
    expect(writes(sent).map(({ table, body }) => ({ table, body }))).toEqual([
      {
        table: 'rpc/ask_question',
        body: { p_household_id: HOUSEHOLD, p_conversation_id: CONVERSATION, p_question_id: QUESTION, p_question: 'Tháng này thu được bao nhiêu từ Dĩ An?', p_deep: false, p_as_of: '2026-10-07T02:00:00.000Z' },
      },
    ]);
  });

  it('writes nothing when the question is already in the conversation, so a second tap opens the same answer', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'messages' ? [{ id: QUESTION }] : []));
    expect(await runOp(askQuestion, context(db), { id: CONVERSATION, questionId: QUESTION, question: 'Câu hỏi' })).toEqual({ ok: true, value: { id: CONVERSATION } });
    expect(writes(sent)).toEqual([]);
  });

  it('says busy while the conversation still streams its last answer', async () => {
    const { db } = fakeDb(
      () => [],
      (request) => (request.table === 'rpc/ask_question' ? { code: '55000', message: 'ESTA_ASK_BUSY' } : null),
    );
    expect(await runOp(askQuestion, context(db), { id: CONVERSATION, questionId: QUESTION, question: 'Còn tháng 9 thì sao?' })).toMatchObject({ ok: false, reason: { kind: 'busy' } });
  });

  it.each(['', '   ', 'a'.repeat(2001)])('refuses the question %j before it reaches the database', async (question) => {
    const { db, sent } = fakeDb();
    expect(await runOp(askQuestion, context(db), { id: CONVERSATION, questionId: QUESTION, question })).toMatchObject({ ok: false, reason: { kind: 'invalid' } });
    expect(sent).toEqual([]);
  });
});
