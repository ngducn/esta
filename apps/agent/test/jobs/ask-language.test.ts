import { describe, expect, it } from 'vitest';
import { askRequest, type EarlierTurn } from '../../src/jobs/ask';
import { fakeDb } from '../../src/test/fake-db';
import { ANSWER, askRpcs, askTables, CONVERSATION, QUESTION, withSeedNames } from '../ask-seed';
import { clockOn, HOUSEHOLD } from '../full-seed';
import { ASK_CONTEXT } from '../golden/ask-cases';
import { replayedReads } from '../golden/ask-reads';
import { ENGLISH_NAMING_RECORDS, VIETNAMESE_NAMING_RECORDS } from '../reply-language-cases';

const ENGLISH = 'write the whole reply in English';
const FOLLOWING: EarlierTurn = { sessionId: 'replay-earlier', turnHash: 'a'.repeat(64), handles: 8 };

/** The prompts the worker builds for a question in the seeded household: its first turn, a follow-up, and the rebuild of a lost session. */
async function prompts(question: string, locale: 'vi' | 'en') {
  const tables = withSeedNames(askTables(question));
  tables.messages?.unshift(
    { id: '00000000-0000-4000-8000-0000000c0a11', household_id: HOUSEHOLD, conversation_id: CONVERSATION, role: 'user', content_md: 'Tháng này thu được bao nhiêu?', status: 'done' },
    { id: '00000000-0000-4000-8000-0000000c0a12', household_id: HOUSEHOLD, conversation_id: CONVERSATION, role: 'assistant', content_md: 'Đã thu một khoản.', status: 'done' },
  );
  const request = (earlier: EarlierTurn | null) =>
    askRequest({ db: fakeDb(tables, [], {}, {}, askRpcs(tables)), householdId: HOUSEHOLD, jobId: 'language', conversationId: CONVERSATION, questionId: QUESTION, answerId: ANSWER, locale, asOf: ASK_CONTEXT.today, timezone: ASK_CONTEXT.timezone, question, earlier, seed: [], deep: false, topic: null, reads: replayedReads(), clock: clockOn('2026-10-07T07:00:00+07:00') });
  const [first, followUp] = await Promise.all([request(null), request(FOLLOWING)]);
  return { first: first.prompt, followUp: followUp.prompt, rebuilt: await followUp.rebuild?.() };
}

describe('the language of the reply, as the ask job builds it from the household (#348)', () => {
  it.each(ENGLISH_NAMING_RECORDS)('tells the model to answer %j in English whatever the household reads, in every prompt the job builds', async (question) => {
    for (const locale of ['vi', 'en'] as const) {
      const { first, followUp, rebuilt } = await prompts(question, locale);
      expect(first).toContain(ENGLISH);
      expect(followUp).toContain(ENGLISH);
      expect(rebuilt).toContain(ENGLISH);
    }
  });

  it.each(VIETNAMESE_NAMING_RECORDS)('leaves %j to the Vietnamese default in every prompt the job builds', async (question) => {
    const { first, followUp, rebuilt } = await prompts(question, 'vi');
    expect(first).not.toContain(ENGLISH);
    expect(followUp).not.toContain(ENGLISH);
    expect(rebuilt).not.toContain(ENGLISH);
  });
});
