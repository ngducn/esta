import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { StatementRow } from './decode';
import { rowFingerprint } from './fingerprint';
import { matchRows, type InvoiceCandidate } from './match';

const huong: InvoiceCandidate = {
  id: 'inv-huong',
  memoCode: '7K2QX9MP',
  tenantName: 'Nguyễn Thị Hường Demo',
  dueDate: isoDate('2026-10-01'),
  outstanding: vnd(3_500_000),
};
const khoa: InvoiceCandidate = {
  id: 'inv-khoa',
  memoCode: 'Q4N8R2TV',
  tenantName: 'Trần Văn Khoa Demo',
  dueDate: isoDate('2026-10-01'),
  outstanding: vnd(4_200_000),
};
const paid: InvoiceCandidate = {
  id: 'inv-paid',
  memoCode: 'B7C3D9EF',
  tenantName: 'Lê Minh Demo',
  dueDate: isoDate('2026-09-01'),
  outstanding: vnd(0),
};
const invoices = [huong, khoa, paid];

function row(overrides: Partial<StatementRow>): StatementRow {
  return { index: 1, date: isoDate('2026-10-05'), amount: vnd(3_500_000), description: '', bankRef: 'FT1', ...overrides };
}

function statusOf(single: StatementRow, candidates: readonly InvoiceCandidate[] = invoices) {
  return matchRows([single], candidates)[0]?.match;
}

describe('memo_match', () => {
  it('matches a credit row that names one issued code, whatever its amount or date', () => {
    const noisy = row({ description: 'MBVCB.1234567.ESTA7K2QX9MP.CT TU 0903', amount: vnd(1), date: isoDate('2027-03-03') });
    expect(statusOf(noisy)).toEqual({ status: 'memo_match', invoiceId: 'inv-huong', memoCode: '7K2QX9MP' });
  });

  it('matches a paid invoice by memo, so an overpayment is visible rather than lost', () => {
    expect(statusOf(row({ description: 'ESTA B7C3D9EF' }))).toEqual({ status: 'memo_match', invoiceId: 'inv-paid', memoCode: 'B7C3D9EF' });
  });

  it('wins over a suggestion for another tenant', () => {
    const conflicting = row({ description: 'TRAN VAN KHOA DEMO ESTA 7K2QX9MP', amount: vnd(4_200_000) });
    expect(statusOf(conflicting)).toMatchObject({ status: 'memo_match', invoiceId: 'inv-huong' });
  });

  it('leaves a row with two issued codes unmatched with both invoices as candidates', () => {
    expect(statusOf(row({ description: 'ESTA Q4N8R2TV ESTA 7K2QX9MP' }))).toEqual({
      status: 'unmatched',
      candidateIds: ['inv-huong', 'inv-khoa'],
    });
  });

  it('falls through to the suggestion rules when the code was never issued', () => {
    expect(statusOf(row({ description: 'ESTA ZZZZZZZZ' }))).toEqual({ status: 'unmatched', candidateIds: [] });
    expect(statusOf(row({ description: 'NGUYEN THI HUONG DEMO ESTA ZZZZZZZZ' }))).toEqual({ status: 'suggested', invoiceId: 'inv-huong' });
  });

  it('ignores FIESTA text whose letters are not an issued code', () => {
    expect(statusOf(row({ description: 'CAFE FIESTA KHONG MA' }))).toEqual({ status: 'unmatched', candidateIds: [] });
  });
});

describe('suggested', () => {
  const transfer = row({ description: 'NGUYEN THI HUONG DEMO CHUYEN TIEN PHONG' });

  it('needs the outstanding amount, the tenant name without diacritics and a date within ten days', () => {
    expect(statusOf(transfer)).toEqual({ status: 'suggested', invoiceId: 'inv-huong' });
  });

  it.each([
    ['ten days before', '2026-09-21', 'suggested'],
    ['ten days after', '2026-10-11', 'suggested'],
    ['eleven days before', '2026-09-20', 'unmatched'],
    ['eleven days after', '2026-10-12', 'unmatched'],
  ])('%s the due date is %s', (_label, date, status) => {
    expect(statusOf(row({ ...transfer, date: isoDate(date) }))).toMatchObject({ status });
  });

  it('accepts the name with spaces removed or written with diacritics', () => {
    expect(statusOf(row({ ...transfer, description: 'NGUYENTHIHUONGDEMO CT' }))).toMatchObject({ status: 'suggested' });
    expect(statusOf(row({ ...transfer, description: 'Nguyễn Thị Hường Demo chuyển tiền' }))).toMatchObject({ status: 'suggested' });
  });

  it.each([
    ['the amount differs by one đồng', { amount: vnd(3_500_001) }],
    ['the name is missing', { description: 'CHUYEN TIEN PHONG' }],
    ['only part of the name appears', { description: 'NGUYEN THI CHUYEN TIEN' }],
  ])('is unmatched when %s', (_label, change) => {
    expect(statusOf(row({ ...transfer, ...change }))).toEqual({ status: 'unmatched', candidateIds: [] });
  });

  it('never suggests a paid invoice, even on an exact name', () => {
    expect(statusOf(row({ description: 'LE MINH DEMO', amount: vnd(0) }))).toEqual({ status: 'ignored', reason: 'debit' });
    expect(statusOf(row({ description: 'LE MINH DEMO', amount: vnd(1_000_000), date: isoDate('2026-09-01') }))).toEqual({
      status: 'unmatched',
      candidateIds: [],
    });
  });

  it('never suggests an invoice whose tenant has no name', () => {
    const unnamed = { ...huong, id: 'inv-unnamed', memoCode: 'ZZZZZZZ1', tenantName: '' };
    expect(statusOf(row({ description: 'CHUYEN TIEN' }), [unnamed])).toEqual({ status: 'unmatched', candidateIds: [] });
  });

  it('lists both candidates, by due date then id, when two invoices fit', () => {
    const later = { ...huong, id: 'inv-huong-11', memoCode: 'A1B2C3D4', dueDate: isoDate('2026-10-10') };
    const earlier = { ...huong, id: 'inv-huong-09', memoCode: 'E5F6G7H8', dueDate: isoDate('2026-09-30') };
    expect(statusOf(transfer, [later, huong, earlier])).toEqual({
      status: 'unmatched',
      candidateIds: ['inv-huong-09', 'inv-huong', 'inv-huong-11'],
    });
  });
});

describe('ignored', () => {
  it('ignores a debit even when it names an issued code and the tenant', () => {
    expect(statusOf(row({ amount: vnd(-3_500_000), description: 'NGUYEN THI HUONG DEMO ESTA 7K2QX9MP' }))).toEqual({
      status: 'ignored',
      reason: 'debit',
    });
  });

  it('keeps two identical transfers in one import as two matches, so a double payment is not lost', () => {
    const memo = row({ description: 'ESTA 7K2QX9MP', bankRef: '' });
    const matched = matchRows([memo, { ...memo, index: 9 }], invoices);
    const once = { status: 'memo_match', invoiceId: 'inv-huong', memoCode: '7K2QX9MP' };
    expect(matched.map((m) => m.match)).toEqual([once, once]);
    expect(matched.map((m) => m.fingerprint)).toEqual([rowFingerprint(memo, 1), rowFingerprint(memo, 2)]);
  });

  it('ignores only the copies an earlier import holds', () => {
    const memo = row({ description: 'ESTA 7K2QX9MP', bankRef: '' });
    const again = matchRows([memo, memo], invoices, { knownFingerprints: new Set([rowFingerprint(memo, 1)]) });
    expect(again.map((m) => m.match)).toEqual([
      { status: 'ignored', reason: 'duplicate' },
      { status: 'memo_match', invoiceId: 'inv-huong', memoCode: '7K2QX9MP' },
    ]);
  });

  it('ignores every row of a re-imported file when its fingerprints are known', () => {
    const rows = [row({ description: 'ESTA 7K2QX9MP' }), row({ index: 2, description: 'NGUYEN THI HUONG DEMO' }), row({ index: 3, amount: vnd(-1) })];
    const first = matchRows(rows, invoices);
    expect(first.map((m) => m.match.status)).toEqual(['memo_match', 'suggested', 'ignored']);
    const again = matchRows(rows, invoices, { knownFingerprints: new Set(first.map((m) => m.fingerprint)) });
    const duplicate = { status: 'ignored', reason: 'duplicate' };
    expect(again.map((m) => m.match)).toEqual([duplicate, duplicate, duplicate]);
  });

  it('carries each row and its fingerprint through', () => {
    const memo = row({ description: 'ESTA 7K2QX9MP' });
    expect(matchRows([memo], invoices)[0]).toEqual({
      row: memo,
      fingerprint: rowFingerprint(memo),
      match: { status: 'memo_match', invoiceId: 'inv-huong', memoCode: '7K2QX9MP' },
    });
  });
});
