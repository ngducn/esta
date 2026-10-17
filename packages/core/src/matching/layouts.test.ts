import { describe, expect, it } from 'vitest';
import { STATEMENT_LAYOUTS, detectColumnMapping, foldHeader, headerRole } from './layouts';

describe('foldHeader', () => {
  it.each([
    ['Số tiền (VND)', 'so tien'],
    ['Ngày giao dịch', 'ngay giao dich'],
    ['  Ghi có  ', 'ghi co'],
    ['DEBIT', 'debit'],
    ['Số dư (đ)', 'so du'],
    ['Nội dung giao dịch', 'noi dung giao dich'],
  ])('folds %j to %j', (header, folded) => {
    expect(foldHeader(header)).toBe(folded);
  });
});

describe('headerRole', () => {
  it.each([
    ['Ngày GD', 'date'],
    ['Transaction Date', 'date'],
    ['Diễn giải', 'description'],
    ['Số tham chiếu', 'bankRef'],
    ['Ghi nợ', 'debit'],
    ['Credit', 'credit'],
    ['Số tiền ghi có', 'credit'],
    ['Amount', 'amount'],
    ['Số dư', 'balance'],
  ])('reads %j as %s', (header, role) => {
    expect(headerRole(header)).toBe(role);
  });

  it('gives no role to an unknown label, a number or an empty cell', () => {
    expect(headerRole('Chi nhánh')).toBeUndefined();
    expect(headerRole(42)).toBeUndefined();
    expect(headerRole(null)).toBeUndefined();
  });
});

describe('detectColumnMapping', () => {
  const headerOf = (id: keyof typeof STATEMENT_LAYOUTS) => STATEMENT_LAYOUTS[id].columns.map((column) => column.header);

  it('maps layout A to a signed amount with a bank reference', () => {
    expect(detectColumnMapping([headerOf('a')])).toEqual({
      ok: true,
      value: { headerRow: 0, mapping: { date: 0, description: 3, bankRef: 1, amount: { kind: 'signed', amount: 2 } } },
    });
  });

  it('maps layout B to credit and debit columns and skips the balance', () => {
    expect(detectColumnMapping([headerOf('b')])).toEqual({
      ok: true,
      value: { headerRow: 0, mapping: { date: 0, description: 5, bankRef: 1, amount: { kind: 'split', credit: 3, debit: 2 } } },
    });
  });

  it('maps the ASCII headers of layout C', () => {
    expect(detectColumnMapping([headerOf('c')])).toEqual({
      ok: true,
      value: { headerRow: 0, mapping: { date: 0, description: 3, bankRef: 1, amount: { kind: 'signed', amount: 2 } } },
    });
  });

  it('finds the header under the account lines a bank prints first', () => {
    const grid = [['Số tài khoản', '0123456789'], ['Từ ngày', '01/10/2026', 'đến', '31/10/2026'], [], headerOf('a'), ['07/10/2026', '', '', '']];
    expect(detectColumnMapping(grid)).toMatchObject({ ok: true, value: { headerRow: 3 } });
  });

  it('leaves the bank reference null when no column names it', () => {
    expect(detectColumnMapping([['Ngày', 'Số tiền', 'Nội dung']])).toEqual({
      ok: true,
      value: { headerRow: 0, mapping: { date: 0, description: 2, bankRef: null, amount: { kind: 'signed', amount: 1 } } },
    });
  });

  it('prefers a signed amount column when credit and debit columns also exist', () => {
    const header = ['Ngày', 'Ghi nợ', 'Ghi có', 'Số tiền', 'Nội dung'];
    expect(detectColumnMapping([header])).toMatchObject({ ok: true, value: { mapping: { amount: { kind: 'signed', amount: 3 } } } });
  });

  it('keeps the first column when a label repeats', () => {
    const header = ['Ngày', 'Nội dung', 'Số tiền', 'Nội dung'];
    expect(detectColumnMapping([header])).toMatchObject({ ok: true, value: { mapping: { description: 1 } } });
  });

  it.each([
    ['no description', [['Ngày', 'Số tiền']]],
    ['only a credit column', [['Ngày', 'Ghi có', 'Nội dung']]],
    ['no date', [['Số tiền', 'Nội dung']]],
    ['an empty grid', []],
    ['a header beyond the scanned rows', [...Array.from({ length: 20 }, () => ['x']), ['Ngày', 'Số tiền', 'Nội dung']]],
  ])('refuses a grid with %s', (_label, grid) => {
    expect(detectColumnMapping(grid)).toEqual({ ok: false, reason: 'no_header' });
  });
});
