import { OPEN_PROSE } from '@esta/core/guard/fixtures/open-prose';
import { describe, expect, it } from 'vitest';
import { ENGLISH_NAMING_RECORDS, SEED_LABELS, VIETNAMESE_NAMING_RECORDS } from '../../test/reply-language-cases';
import { replyLanguage } from './language';

/**
 * Mẹ writes Vietnamese with English words mixed in (bill, ok, deadline, check, app) and often types without marks. An
 * English reply to her is the worse mistake (#348), so none of these may read as English.
 */
const VIETNAMESE_MESSAGES = [
  // The three the review of the first version found.
  'Gửi bill phòng 5',
  'Phòng 2 overdue',
  'phong be it tien',
  // English words mixed into marked Vietnamese.
  'Gửi bill cho phòng 5',
  'Chụp bill tiền điện phòng 3',
  'Check bill phòng 7 giúp mẹ',
  'Phòng 5 paid chưa?',
  'Due date phòng 4 là ngày nào',
  'Deadline đóng tiền phòng 3 là khi nào?',
  'ok con, mẹ check app rồi',
  'Check app giúp mẹ',
  'Update giúp mẹ phòng 3 đã thanh toán',
  'Bill tháng 9 phòng 2 đã paid chưa, check lại giúp mẹ',
  'Room 5 chưa đóng tiền, nhắc giúp mẹ',
  'Gửi file hợp đồng phòng 4 cho mẹ check nhé',
  'Thanks con, ok rồi nhé',
  'ok, cảm ơn',
  // Marked, with no English at all.
  'Phòng 5 trễ hạn mấy tháng?',
  'Tháng này thu được bao nhiêu từ Dĩ An?',
  // Typed without marks.
  'phong 5 tre han may thang',
  'gui bill phong 5 cho me',
  'tien dien thang nay bao nhieu',
  'phong 3 chua dong tien, check giup me',
  'deadline nop thue la khi nao',
  'app bi loi, khong vao duoc',
  'cho me xem bill phong 3 voi',
  'sao bill phong 2 cao the',
  'phong be it tien thang nay',
  // Only words Mẹ borrows, or too short to tell.
  'check bill app deadline ok',
  'ok',
  'ok con',
  'bill',
] as const;

/** Plain English, with Vietnamese names inside it where a family would write them. */
const ENGLISH_MESSAGES = [
  ...OPEN_PROSE.filter(({ id }) => id.startsWith('en-')).map(({ question }) => question),
  'Which tenant paid late most often this year?',
  'Which rooms in Dĩ An are overdue?',
  'Write a short message reminding the tenant in Phòng 5 to pay.',
  'How much rent did the tenant in Room 5 pay last month?',
  'Please explain what a deposit is and who should keep it.',
  'Tell me which property earns the most income this year',
  'What should I do when a tenant has not paid for two months?',
  'Is it better to sell the land or to keep renting the house?',
] as const;

const isMarked = (message: string) => /[\p{M}đ]/u.test(message.normalize('NFD'));

describe('the language of the reply (#348)', () => {
  it('has at least 20 Vietnamese and 8 English cases, and the five English probes among them', () => {
    expect(VIETNAMESE_MESSAGES.length).toBeGreaterThanOrEqual(20);
    expect(ENGLISH_MESSAGES.length).toBeGreaterThanOrEqual(8);
    expect(OPEN_PROSE.filter(({ id }) => id.startsWith('en-'))).toHaveLength(5);
  });

  it('has at least 8 English and 5 Vietnamese questions that name seeded records', () => {
    expect(ENGLISH_NAMING_RECORDS.length).toBeGreaterThanOrEqual(8);
    expect(VIETNAMESE_NAMING_RECORDS.length).toBeGreaterThanOrEqual(5);
  });

  it.each(VIETNAMESE_MESSAGES)('answers %j in Vietnamese in a household that reads Vietnamese', (message) => {
    expect(replyLanguage(message, 'vi')).toBe('vi');
  });

  it.each(VIETNAMESE_MESSAGES.filter(isMarked))('answers the marked %j in Vietnamese even in a household that reads English', (message) => {
    expect(replyLanguage(message, 'en')).toBe('vi');
  });

  it.each(ENGLISH_MESSAGES)('answers %j in English', (message) => {
    expect(replyLanguage(message, 'vi')).toBe('en');
  });

  it.each(ENGLISH_NAMING_RECORDS)('answers %j in English, a household that reads either language, because the records it names are neither language', (message) => {
    expect(replyLanguage(message, 'vi', SEED_LABELS)).toBe('en');
    expect(replyLanguage(message, 'en', SEED_LABELS)).toBe('en');
  });

  it.each(VIETNAMESE_NAMING_RECORDS)('answers %j in Vietnamese in a household that reads Vietnamese, the names stripped', (message) => {
    expect(replyLanguage(message, 'vi', SEED_LABELS)).toBe('vi');
  });

  it.each(VIETNAMESE_NAMING_RECORDS.filter(isMarked))('answers the marked %j in Vietnamese even in a household that reads English, the names stripped', (message) => {
    expect(replyLanguage(message, 'en', SEED_LABELS)).toBe('vi');
  });

  it('keeps every Vietnamese message of the table above Vietnamese when the household has its labels', () => {
    for (const message of VIETNAMESE_MESSAGES) expect(replyLanguage(message, 'vi', SEED_LABELS), message).toBe('vi');
  });

  it('matches a label without regard to case or marks, and in the decomposed form', () => {
    const question = 'Should I renew the lease on Căn hộ Thủ Đức?';
    expect(replyLanguage(question.toUpperCase(), 'vi', SEED_LABELS)).toBe('en');
    expect(replyLanguage('should i renew the lease on can ho thu duc?', 'vi', SEED_LABELS)).toBe('en');
    expect(replyLanguage(question.normalize('NFD'), 'vi', SEED_LABELS)).toBe('en');
  });

  it('strips the longest label first, so the shorter label inside it leaves nothing behind', () => {
    const question = 'Should I renew the lease on Căn hộ Thủ Đức?';
    expect(replyLanguage(question, 'vi', ['Thủ Đức', 'Căn hộ Thủ Đức'])).toBe('en');
    expect(replyLanguage(question, 'vi', ['Căn hộ Thủ Đức', 'Thủ Đức'])).toBe('en');
    expect(replyLanguage(question, 'vi', ['Thủ Đức'])).toBe('vi');
  });

  it('strips a label by whole words, so Phòng 5 does not take the front of Phòng 55', () => {
    expect(replyLanguage('Should I renew Phòng 55 Phòng 56 Phòng 57 lease?', 'vi', ['Phòng 5'])).toBe('vi');
    expect(replyLanguage('Should I renew Phòng 5 Phòng 5 Phòng 5 lease?', 'vi', ['Phòng 5'])).toBe('en');
  });

  it('counts the words a label does not take: a Vietnamese word beside a name still makes the message Vietnamese', () => {
    expect(replyLanguage('Should I renew the lease on Căn hộ Thủ Đức, mẹ?', 'vi', SEED_LABELS)).toBe('en');
    expect(replyLanguage('Should I renew the lease on Căn hộ Thủ Đức, mẹ hỏi giúp?', 'vi', SEED_LABELS)).toBe('vi');
  });

  it('leaves a message that is neither clearly English nor Vietnamese to the language the household reads', () => {
    expect(replyLanguage('ok', 'vi')).toBe('vi');
    expect(replyLanguage('ok', 'en')).toBe('en');
    expect(replyLanguage('check bill app deadline ok', 'en')).toBe('en');
  });

  it('counts a word typed in the decomposed form as it counts the composed one', () => {
    expect(replyLanguage('Gửi bill phòng 5'.normalize('NFD'), 'en')).toBe('vi');
  });
});
