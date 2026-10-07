import { describe, expect, it } from 'vitest';
import unaccentTest from '../../../../supabase/tests/unaccent.test.sql?raw';
import { foldVietnamese, matchesSearch } from './fold';

const SQL_FOLD_CASE = /is\(\s*public\.esta_unaccent\('([^']+)'\),\s*'([^']+)'/g;
const sqlFoldCases = [...unaccentTest.matchAll(SQL_FOLD_CASE)].map(([, text = '', folded = '']) => [text, folded]);

describe('foldVietnamese', () => {
  it('has the esta_unaccent cases from supabase/tests/unaccent.test.sql to agree with', () => {
    expect(sqlFoldCases.length).toBeGreaterThanOrEqual(4);
  });

  it.each(sqlFoldCases)('folds %s as esta_unaccent does', (text, folded) => {
    expect(foldVietnamese(text)).toBe(folded);
  });

  it('lowercases ASCII', () => {
    expect(foldVietnamese('DUONG')).toBe('duong');
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
