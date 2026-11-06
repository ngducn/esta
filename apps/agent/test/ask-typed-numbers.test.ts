import { isoDate } from '@esta/core/date';
import { describe, expect, it } from 'vitest';
import { askRequest } from '../src/jobs/ask';
import { fakeDb } from '../src/test/fake-db';
import { ANSWER, askRpcs, askTables, CONVERSATION, QUESTION } from './ask-seed';
import { clockOn, HOUSEHOLD } from './full-seed';
import { replayedReads } from './golden/ask-reads';

const HASH = 'a'.repeat(64);

async function promptFor(question: string, { earlier, seed }: { earlier?: string; seed?: Array<{ question: string; answer: string }> } = {}): Promise<string> {
  const tables = askTables(question);
  if (earlier !== undefined) tables.messages?.unshift({ id: 'e1', household_id: HOUSEHOLD, conversation_id: CONVERSATION, role: 'user', content_md: earlier, status: 'done', topic_item_id: null, topic_property_id: null });
  const prepared = await askRequest({
    db: fakeDb(tables, [], {}, {}, askRpcs(tables)),
    householdId: HOUSEHOLD,
    jobId: 'typed',
    conversationId: CONVERSATION,
    questionId: QUESTION,
    answerId: ANSWER,
    locale: 'vi',
    asOf: isoDate('2026-10-07'),
    timezone: 'Asia/Ho_Chi_Minh',
    question,
    earlier: earlier === undefined ? null : { sessionId: 's', turnHash: HASH, handles: 3 },
    seed: seed ?? [],
    deep: false,
    topic: null,
    reads: replayedReads(),
    clock: clockOn('2026-10-07T07:00:00+07:00'),
  });
  return prepared.prompt;
}

describe('the numbers she wrote, listed by handle before the first turn', () => {
  it('lists the amount, the months and the rate of her question, and not a unit label', async () => {
    const prompt = await promptFor('Vay 2 tỷ trong 15 năm, lãi 9%/năm thì trả bao nhiêu cho phòng 2?');
    expect(prompt).toContain('f1: 2.000.000.000 ₫ (written "2 tỷ")');
    expect(prompt).toContain('f2: 180 tháng (written "15 năm")');
    expect(prompt).toContain('f3: 9% (written "9%/năm")');
    expect(prompt).not.toContain('f4:');
  });

  it('lists nothing when she wrote no number', async () => {
    expect(await promptFor('Tháng này thu được bao nhiêu từ Dĩ An?')).not.toContain('Numbers the family member wrote');
  });

  it('lists her questions of a seeded segment, and not their answers', async () => {
    const prompt = await promptFor('Còn tháng 8 thì sao?', { seed: [{ question: 'Nếu tăng lên 4tr thì sao?', answer: 'Thu thêm 18.000.000 ₫ mỗi năm.' }] });
    expect(prompt).toContain('f1: 4.000.000 ₫ (written "4tr")');
    expect(prompt).not.toContain('f2:');
  });

  it('lists the numbers of her earlier messages in a follow-up, from the handle after the ones it handed out', async () => {
    const prompt = await promptFor('Còn 5tr thì sao?', { earlier: 'Nếu tăng tiền lên 4tr thì sao?' });
    expect(prompt).toContain('f4: 4.000.000 ₫ (written "4tr")');
    expect(prompt).toContain('f5: 5.000.000 ₫ (written "5tr")');
  });
});
