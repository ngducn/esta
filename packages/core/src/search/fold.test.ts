import { describe, expect, it } from 'vitest';
import { foldVietnamese, matchesSearch } from './fold';

describe('foldVietnamese', () => {
  it.each([
    ['Đường Dĩ An', 'duong di an'],
    ['Hợp đồng', 'hop dong'],
    ['Sổ hồng Bảo Lộc', 'so hong bao loc'],
    ['ĐẶNG THỊ HƯỜNG', 'dang thi huong'],
    ['ẫ ặ ữ ỡ ự ể ộ ổ ỗ ờ ở ợ ụ ủ ứ ừ ử ỳ ỷ ỹ Ỵ', 'a a u o u e o o o o o o u u u u u y y y y'],
    ['DUONG', 'duong'],
  ])('folds %s', (text, folded) => {
    expect(foldVietnamese(text)).toBe(folded);
  });

  it('folds decomposed input the same as precomposed input', () => {
    expect(foldVietnamese('Hợp đồng'.normalize('NFD'))).toBe('hop dong');
  });
});

describe('matchesSearch', () => {
  it.each([
    ['di an', 'Dĩ An'],
    ['hop dong', 'Hợp đồng'],
    ['DUONG', 'Đường'],
    ['bao loc so', 'Sổ hồng Bảo Lộc'],
  ])('DOMAIN-VN §9: %s finds %s', (query, text) => {
    expect(matchesSearch(query, text)).toBe(true);
  });

  it('requires every query word', () => {
    expect(matchesSearch('bao loc hop', 'Sổ hồng Bảo Lộc')).toBe(false);
    expect(matchesSearch('dong nai', 'Hợp đồng')).toBe(false);
  });

  it('treats a blank query as matching everything', () => {
    expect(matchesSearch('   ', 'Sổ hồng Bảo Lộc')).toBe(true);
  });
});
