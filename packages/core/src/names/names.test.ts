import { describe, expect, it } from 'vitest';
import { compareVietnameseNames, givenName, idLast4, sameName, sortKeyVietnameseName } from './index';

describe('givenName', () => {
  it('is the last word of the full name, which a reminder greets', () => {
    expect(givenName('Nguyễn Thị Hường')).toBe('Hường');
    expect(givenName('  Trần   Văn Khoa ')).toBe('Khoa');
    expect(givenName('Hường')).toBe('Hường');
  });
});

describe('sortKeyVietnameseName', () => {
  it('orders the parts given, middle, family', () => {
    expect(sortKeyVietnameseName('Nguyễn Thị Hường')).toBe('Hường Thị Nguyễn');
    expect(sortKeyVietnameseName('  Trần   Văn Khoa ')).toBe('Khoa Văn Trần');
    expect(sortKeyVietnameseName('Tôn Nữ Demo Minh Châu')).toBe('Châu Nữ Demo Minh Tôn');
    expect(sortKeyVietnameseName('Demo')).toBe('Demo');
  });
});

describe('compareVietnameseNames', () => {
  it('sorts Nguyễn Thị Hường before Trần Văn Khoa (DOMAIN-VN §9)', () => {
    expect(compareVietnameseNames('Nguyễn Thị Hường', 'Trần Văn Khoa')).toBeLessThan(0);
    expect(compareVietnameseNames('Trần Văn Khoa', 'Nguyễn Thị Hường')).toBeGreaterThan(0);
  });

  it('breaks ties on the middle name, then the family name', () => {
    expect(compareVietnameseNames('Trần Demo Văn An', 'Lê Demo Thị An')).toBeGreaterThan(0);
    expect(compareVietnameseNames('Lê Demo An', 'Bùi Demo An')).toBeGreaterThan(0);
    expect(compareVietnameseNames('Lê Demo An', 'Lê Demo An')).toBe(0);
  });

  it('uses vi collation, with D before Đ and plain vowels before marked ones', () => {
    const names = ['Phạm Demo Đức', 'Võ Demo Dũng', 'Lý Demo Ánh', 'Hồ Demo Anh', 'Mai Demo An'];
    expect([...names].sort(compareVietnameseNames)).toEqual([
      'Mai Demo An',
      'Hồ Demo Anh',
      'Lý Demo Ánh',
      'Võ Demo Dũng',
      'Phạm Demo Đức',
    ]);
  });

  it('sorts a shorter given name before a longer one that starts with it', () => {
    expect(compareVietnameseNames('Bùi Demo Thị An', 'Bùi Demo Anh')).toBeLessThan(0);
  });
});

describe('idLast4', () => {
  it('keeps the last four digits of a pasted 12-digit CCCD', () => {
    expect(idLast4('079201005582')).toBe('5582');
  });

  it('keeps the last four digits of a pasted 9-digit CMND with separators', () => {
    expect(idLast4('023 456 789')).toBe('6789');
  });

  it('keeps fewer digits as typed and drops everything that is not a digit', () => {
    expect(idLast4('55')).toBe('55');
    expect(idLast4('a5-5b')).toBe('55');
    expect(idLast4('')).toBe('');
  });
});

describe('sameName', () => {
  it.each([
    ['the old and new tone placement', 'Lê Thị Hoà Demo', 'Lê Thị Hòa Demo'],
    ['the old and new tone placement on uy', 'Phạm Thị Thuỷ Demo', 'Phạm Thị Thủy Demo'],
    ['the old and new tone placement on oe', 'Trần Văn Khoẻ Demo', 'Trần Văn Khỏe Demo'],
    ['one side written without diacritics', 'Nguyen Thi Lan', 'NGUYỄN THỊ LAN'],
    ['one side without diacritics or đ', 'Dang Quoc Demo', 'Đặng Quốc Demo'],
    ['a title Ông', 'Ông Trần Văn Demo', 'Trần Văn Demo'],
    ['a title Bà with a colon, as a certificate prints it', 'Bà: NGUYỄN THỊ DEMO', 'Nguyễn Thị Demo'],
    ['a title Hộ ông', 'Hộ ông Trần Văn Demo', 'trần văn demo'],
    ['a title Hộ bà', 'Hộ bà Nguyễn Thị Demo', 'Nguyễn  Thị Demo'],
    ['NFD against NFC', 'Võ Thị Demo Mai'.normalize('NFD'), 'Võ Thị Demo Mai'],
  ])('matches %s', (_case, a, b) => {
    expect(sameName(a, b)).toBe(true);
    expect(sameName(b, a)).toBe(true);
  });

  it.each([
    ['another person', 'Trần Văn Demo', 'Nguyễn Thị Demo'],
    ['another tone, both sides marked', 'Nguyễn Thị Lan', 'Nguyễn Thị Lân'],
    ['another vowel, both sides marked', 'Lê Văn Demo Hà', 'Lê Văn Demo Hạ'],
    ['a name that only shares the title', 'Bà Nguyễn Thị Demo', 'Bà Nguyễn Thị Demo Lan'],
  ])('tells apart %s', (_case, a, b) => {
    expect(sameName(a, b)).toBe(false);
  });
});
