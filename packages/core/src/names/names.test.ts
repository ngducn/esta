import { describe, expect, it } from 'vitest';
import { compareVietnameseNames, sortKeyVietnameseName } from './index';

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
