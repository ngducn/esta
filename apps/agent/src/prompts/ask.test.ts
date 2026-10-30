import { isoDate } from '@esta/core/date';
import { describe, expect, it } from 'vitest';
import { askFollowUpPrompt, askPrompt } from './ask';

const CONTEXT = { locale: 'vi' as const, today: isoDate('2026-10-07'), timezone: 'Asia/Ho_Chi_Minh' };
const ENGLISH = 'write the whole reply in English';

describe('the language of the reply (#348)', () => {
  it.each([
    'Which tenant paid late most often this year?',
    'Which rooms in Dĩ An are overdue?',
    'Write a short message reminding the tenant in Phòng 5 to pay.',
    'Should I rent by the year instead of by the month?',
    'Can you give me a second opinion on selling the Bảo Lộc land?',
  ])('tells the model in so many words to answer %j in English', (question) => {
    expect(askPrompt({ ...CONTEXT, question })).toContain(ENGLISH);
    expect(askFollowUpPrompt({ ...CONTEXT, question, firstHandle: 9 })).toContain(ENGLISH);
  });

  it.each([
    'Tháng này thu được bao nhiêu từ Dĩ An?',
    'thang nay thu duoc bao nhieu tu Di An',
    'Viết tin nhắn Zalo nhắc Phòng 5 đóng tiền',
    'Có nên gia hạn hợp đồng Căn hộ Thủ Đức không?',
    'Phòng 5',
  ])('leaves %j to the Vietnamese default, so a Vietnamese prompt does not change', (question) => {
    expect(askPrompt({ ...CONTEXT, question })).not.toContain(ENGLISH);
    expect(askFollowUpPrompt({ ...CONTEXT, question, firstHandle: 9 })).not.toContain(ENGLISH);
  });
});
