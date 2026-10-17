import { describe, expect, it } from 'vitest';
import { findMemoCodes, normalizeDescription } from './memo';

const issued = new Set(['7K2QX9MP', 'Q4N8R2TV']);

describe('normalizeDescription', () => {
  it.each([
    ['MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903', 'MBVCB1234567ESTA7K2QX9MPCTTU0903'],
    ['esta 7k2qx9mp', 'ESTA7K2QX9MP'],
    ['E S T A - 7K2Q_X9MP', 'ESTA7K2QX9MP'],
    ['Thanh toán tiền phòng ESTA 7K2QX9MP', 'THANHTOANTIENPHONGESTA7K2QX9MP'],
    ['Đặt cọc Phòng 5', 'DATCOCPHONG5'],
    ['', ''],
  ])('reduces %j to %j', (text, normalized) => {
    expect(normalizeDescription(text)).toBe(normalized);
  });
});

describe('findMemoCodes', () => {
  it('finds the DOMAIN-VN §9 example with bank references around the memo', () => {
    expect(findMemoCodes('MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903123456', issued)).toEqual(['7K2QX9MP']);
  });

  it.each([
    ['memo as issued', 'ESTA 7K2QX9MP'],
    ['lowercase', 'esta 7k2qx9mp'],
    ['separators inside the prefix and the code', 'E.S.T.A-7K2Q X9MP'],
    ['diacritics around the memo', 'Tiền phòng tháng 10 ESTA 7K2QX9MP Nguyễn Văn Demo'],
    ['FIESTA before a real memo', 'CAFEFIESTAESTA7K2QX9MP'],
    ['memo at the very end', 'CT DEN:0123 ESTA7K2QX9MP'],
  ])('matches the %s form', (_label, description) => {
    expect(findMemoCodes(description, issued)).toEqual(['7K2QX9MP']);
  });

  it('never matches FIESTA text whose following letters are not an issued code', () => {
    expect(findMemoCodes('CAFE FIESTA 7K2QX9MQ', issued)).toEqual([]);
    expect(findMemoCodes('CAFE FIESTA KHONG MA', issued)).toEqual([]);
    expect(findMemoCodes('FIESTA7K2QX9MP', new Set(['7K2QX9MP']))).toEqual(['7K2QX9MP']);
  });

  it('checks every ESTA occurrence and keeps only the issued one', () => {
    expect(findMemoCodes('ESTA XXXXXXXX ESTA Q4N8R2TV', issued)).toEqual(['Q4N8R2TV']);
  });

  it('refuses a well-formed code that was never issued', () => {
    expect(findMemoCodes('ESTA ZZZZZZZZ', issued)).toEqual([]);
  });

  it('refuses a code that is too short or runs past the end', () => {
    expect(findMemoCodes('ESTA 7K2QX9M', issued)).toEqual([]);
    expect(findMemoCodes('ESTA', issued)).toEqual([]);
  });

  it('returns each code once and both codes when two are present', () => {
    expect(findMemoCodes('ESTA 7K2QX9MP ESTA 7K2QX9MP', issued)).toEqual(['7K2QX9MP']);
    expect(findMemoCodes('ESTA 7K2QX9MP va ESTA Q4N8R2TV', issued)).toEqual(['7K2QX9MP', 'Q4N8R2TV']);
  });

  it('finds nothing when no code is issued', () => {
    expect(findMemoCodes('ESTA 7K2QX9MP', new Set())).toEqual([]);
  });
});
