import { describe, expect, it } from 'vitest';
import { askQuestion } from './ask-ops';
import { runOp } from './op';
import { fakeDb, HOUSEHOLD, opContext as context, type Sent } from './test/fake-db';

const CONVERSATION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c01';
const QUESTION = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0c02';
const writes = (sent: readonly Sent[]) => sent.filter((request) => request.method !== 'GET');

describe('askQuestion', () => {
  it('sends through ask_in_thread with the trimmed question and its id, and no date', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'rpc/ask_in_thread' ? [CONVERSATION] : []));
    expect((await runOp(askQuestion, context(db), { questionId: QUESTION, question: '  Tháng này thu được bao nhiêu từ Dĩ An?  ' })).ok).toBe(true);
    expect(writes(sent).map(({ table, body }) => ({ table, body }))).toEqual([
      { table: 'rpc/ask_in_thread', body: { p_household_id: HOUSEHOLD, p_question_id: QUESTION, p_question: 'Tháng này thu được bao nhiêu từ Dĩ An?', p_deep: false } },
    ]);
  });

  it.each([
    [{ kind: 'item', itemId: CONVERSATION }, { kind: 'item', id: CONVERSATION }],
    [{ kind: 'property', propertyId: CONVERSATION }, { kind: 'property', id: CONVERSATION }],
  ])('sends the topic %j as ask_in_thread reads it', async (topic, sentTopic) => {
    const { db, sent } = fakeDb((request) => (request.table === 'rpc/ask_in_thread' ? [CONVERSATION] : []));
    expect((await runOp(askQuestion, context(db), { questionId: QUESTION, question: 'Khách này trễ mấy lần rồi?', topic })).ok).toBe(true);
    expect(writes(sent).map(({ body }) => body)).toEqual([{ p_household_id: HOUSEHOLD, p_question_id: QUESTION, p_question: 'Khách này trễ mấy lần rồi?', p_deep: false, p_topic: sentTopic }]);
  });

  it.each([{ kind: 'lease', itemId: CONVERSATION }, { kind: 'item', itemId: 'Phòng 5' }, { kind: 'item', propertyId: CONVERSATION }])('refuses the topic %j before it reaches the database', async (topic) => {
    const { db, sent } = fakeDb();
    expect(await runOp(askQuestion, context(db), { questionId: QUESTION, question: 'Câu hỏi', topic })).toMatchObject({ ok: false, reason: { kind: 'invalid' } });
    expect(sent).toEqual([]);
  });

  it('refuses a conversation id, so no caller picks the segment', async () => {
    const { db, sent } = fakeDb();
    expect(await runOp(askQuestion, context(db), { id: CONVERSATION, questionId: QUESTION, question: 'Câu hỏi' })).toMatchObject({ ok: false, reason: { kind: 'invalid' } });
    expect(sent).toEqual([]);
  });

  it('writes nothing when the question is already saved, so a second tap shows the same answer', async () => {
    const { db, sent } = fakeDb((request) => (request.table === 'messages' ? [{ conversation_id: CONVERSATION }] : []));
    expect(await runOp(askQuestion, context(db), { questionId: QUESTION, question: 'Câu hỏi' })).toEqual({ ok: true, value: { id: CONVERSATION } });
    expect(writes(sent)).toEqual([]);
  });

  it('says busy while the segment still streams its last answer', async () => {
    const { db } = fakeDb(
      () => [],
      (request) => (request.table === 'rpc/ask_in_thread' ? { code: '55000', message: 'ESTA_ASK_BUSY' } : null),
    );
    expect(await runOp(askQuestion, context(db), { questionId: QUESTION, question: 'Còn tháng 9 thì sao?' })).toMatchObject({ ok: false, reason: { kind: 'busy' } });
  });

  it.each(['', '   ', 'a'.repeat(2001)])('refuses the question %j before it reaches the database', async (question) => {
    const { db, sent } = fakeDb();
    expect(await runOp(askQuestion, context(db), { questionId: QUESTION, question })).toMatchObject({ ok: false, reason: { kind: 'invalid' } });
    expect(sent).toEqual([]);
  });
});
