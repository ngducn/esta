import { describe, expect, it } from 'vitest';
import { PROPERTY_CODE_MAX_LENGTH, suggestPropertyCode } from './code';

describe('suggestPropertyCode', () => {
  it.each([
    ['Nhà phố Q7', 'Q7'],
    ['Mặt bằng Quận 1', 'Q1'],
    ['Kho Biên Hòa', 'KBH'],
    ['Đất Bảo Lộc', 'DBL'],
    ['Căn hộ Thủ Đức', 'CHTD'],
    ['Dãy trọ Dĩ An', 'DTDA'],
    ['Nhà', 'NHA'],
    ['Phòng 12, lô B3', 'B3'],
  ])('reads %s as %s', (nickname, code) => {
    expect(suggestPropertyCode(nickname, [])).toBe(code);
  });

  it('folds diacritics and đ to ASCII', () => {
    expect(suggestPropertyCode('Đường Ỷ Lan', [])).toBe('DYL');
    expect(suggestPropertyCode('Nhà phố Q7'.normalize('NFD'), [])).toBe('Q7');
  });

  it('falls back to TS when the nickname has no letters or digits', () => {
    expect(suggestPropertyCode('… — !', [])).toBe('TS');
  });

  it('takes the first free numeric suffix, case-insensitively', () => {
    expect(suggestPropertyCode('Nhà phố Q7', ['Q7'])).toBe('Q72');
    expect(suggestPropertyCode('Nhà phố Q7', ['q7', 'Q72', 'Q73'])).toBe('Q74');
  });

  it('stays within 8 characters, trimming the base to fit the suffix', () => {
    expect(suggestPropertyCode('Thanhphotaynguyen', [])).toBe('THANHPHO');
    expect(suggestPropertyCode('Thanhphotaynguyen', ['THANHPHO'])).toBe('THANHPH2');
    const taken = ['THANHPHO', ...Array.from({ length: 9 }, (_, i) => `THANHPH${i + 2}`.slice(0, 8))];
    const code = suggestPropertyCode('Thanhphotaynguyen', taken);
    expect(code).toBe('THANHP10');
    expect(code.length).toBeLessThanOrEqual(PROPERTY_CODE_MAX_LENGTH);
  });

  it('only ever returns codes the database check admits', () => {
    for (const nickname of ['Nhà phố Q7', 'Căn hộ Sky 9 – block A', '  ', 'Ấp 3 xã Tân Ân']) {
      expect(suggestPropertyCode(nickname, [])).toMatch(/^[A-Z0-9]{1,8}$/);
    }
  });
});
