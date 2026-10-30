import { isoDate } from '@esta/core/date';
import { describe, expect, it } from 'vitest';
import { ENGLISH_NAMING_RECORDS, SEED_LABELS, VIETNAMESE_NAMING_RECORDS } from '../../test/reply-language-cases';
import { askFollowUpPrompt, askPrompt } from './ask';

const CONTEXT = { locale: 'vi' as const, today: isoDate('2026-10-07'), timezone: 'Asia/Ho_Chi_Minh', labels: SEED_LABELS };
const ENGLISH = 'write the whole reply in English';

describe('the language of the reply (#348)', () => {
  it.each([
    'Which tenant paid late most often this year?',
    'Which rooms in Dĩ An are overdue?',
    'Write a short message reminding the tenant in Phòng 5 to pay.',
    'Should I rent by the year instead of by the month?',
    'Can you give me a second opinion on selling the Bảo Lộc land?',
    ...ENGLISH_NAMING_RECORDS,
  ])('tells the model in so many words to answer %j in English', (question) => {
    for (const locale of ['vi', 'en'] as const) {
      expect(askPrompt({ ...CONTEXT, locale, question })).toContain(ENGLISH);
      expect(askFollowUpPrompt({ ...CONTEXT, locale, question, firstHandle: 9 })).toContain(ENGLISH);
    }
  });

  it.each([
    'Tháng này thu được bao nhiêu từ Dĩ An?',
    'thang nay thu duoc bao nhieu tu Di An',
    'Viết tin nhắn Zalo nhắc Phòng 5 đóng tiền',
    ...VIETNAMESE_NAMING_RECORDS,
    'Phòng 5',
    'Gửi bill phòng 5',
    'Phòng 2 overdue',
    'phong be it tien',
  ])('leaves %j to the Vietnamese default, so a Vietnamese prompt does not change', (question) => {
    expect(askPrompt({ ...CONTEXT, question })).not.toContain(ENGLISH);
    expect(askFollowUpPrompt({ ...CONTEXT, question, firstHandle: 9 })).not.toContain(ENGLISH);
  });

  it('says English for a message that gives no sign of either language only in a household that reads English', () => {
    const question = 'ok';
    expect(askPrompt({ ...CONTEXT, locale: 'en', question })).toContain(ENGLISH);
    expect(askFollowUpPrompt({ ...CONTEXT, locale: 'en', question, firstHandle: 9 })).toContain(ENGLISH);
    expect(askPrompt({ ...CONTEXT, locale: 'vi', question })).not.toContain(ENGLISH);
  });

  it('keeps Vietnamese for a marked message even in a household that reads English', () => {
    expect(askPrompt({ ...CONTEXT, locale: 'en', question: 'Gửi bill phòng 5' })).not.toContain(ENGLISH);
  });
});

describe('the reason a recommendation gives (#354)', () => {
  it.each(['Có nên gia hạn hợp đồng Căn hộ Thủ Đức không?', 'Should I renew the lease on Căn hộ Thủ Đức?'])('tells the model to give a reason for %j that the fields it cites agree with', (question) => {
    const prompt = askPrompt({ ...CONTEXT, question });
    expect(prompt).toContain('never a reason that a field you cite contradicts');
    expect(prompt).toContain('A tenant who paid most bills late does not pay regularly');
  });
});
