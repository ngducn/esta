import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { StatementRow } from './decode';
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

  it('ignores every row of a re-imported file when its fingerprints are known', () => {
    const rows = [
      row({ description: 'ESTA 7K2QX9MP' }),
      row({ index: 2, description: 'NGUYEN THI HUONG DEMO', bankRef: 'FT2' }),
      row({ index: 3, amount: vnd(-1), bankRef: 'FT3' }),
    ];
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
      fingerprint: sha256('ref\n2026-10-05\n3500000\nFT1'),
      match: { status: 'memo_match', invoiceId: 'inv-huong', memoCode: '7K2QX9MP' },
    });
  });
});

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const once = { status: 'memo_match', invoiceId: 'inv-huong', memoCode: '7K2QX9MP' };
const duplicate = { status: 'ignored', reason: 'duplicate' };

describe('a row with a bank reference', () => {
  const memo = row({ description: 'MBVCB.2627501.ESTA7K2QX9MP.CT TU 0903', bankRef: 'FT26275001' });
  const other = row({ index: 2, description: 'ESTA Q4N8R2TV', amount: vnd(4_200_000), bankRef: 'FT26276002' });

  it('is fingerprinted by its reference, date and amount, so P3-15 can store one key per transfer', () => {
    expect(matchRows([memo], invoices)[0]?.fingerprint).toBe(sha256('ref\n2026-10-05\n3500000\nFT26275001'));
  });

  it('is ignored as a duplicate when the same reference, date and amount appear again in the file', () => {
    const matched = matchRows([memo, { ...memo, index: 12 }], invoices);
    expect(matched.map((m) => m.match)).toEqual([once, duplicate]);
    expect(matched[1]?.fingerprint).toBe(matched[0]?.fingerprint);
  });

  it('posts each transfer once when two overlapping exports are pasted into one file', () => {
    const file = [memo, other, { ...memo, index: 3 }, { ...other, index: 4 }];
    expect(matchRows(file, invoices).map((m) => m.match.status)).toEqual(['memo_match', 'memo_match', 'ignored', 'ignored']);
  });

  it('stays a duplicate on re-import when the bank words the description differently', () => {
    const known = new Set(matchRows([memo], invoices).map((m) => m.fingerprint));
    const reworded = { ...memo, description: 'ESTA 7K2QX9MP CT TU 0903123456 NGUYEN THI HUONG DEMO' };
    expect(matchRows([reworded], invoices, { knownFingerprints: known })[0]?.match).toEqual(duplicate);
  });

  it('is another transfer when the same reference comes with another date or amount', () => {
    expect(matchRows([memo, { ...memo, date: isoDate('2026-11-05') }], invoices).map((m) => m.match)).toEqual([once, once]);
    expect(matchRows([memo, { ...memo, amount: vnd(1_000) }], invoices).map((m) => m.match)).toEqual([once, once]);
  });
});

describe('a row without a bank reference', () => {
  const cash = row({ description: 'NOP TIEN MAT ESTA 7K2QX9MP', bankRef: '' });
  const repeat = (...candidateIds: string[]) => ({ status: 'unmatched', candidateIds, repeatOf: 1 });

  it('is fingerprinted by date, amount, normalized description and which identical copy it is', () => {
    expect(matchRows([cash, { ...cash, index: 2 }], invoices).map((m) => m.fingerprint)).toEqual([
      sha256('row\n2026-10-05\n3500000\nNOPTIENMATESTA7K2QX9MP\n1'),
      sha256('row\n2026-10-05\n3500000\nNOPTIENMATESTA7K2QX9MP\n2'),
    ]);
  });

  it('auto-matches only the first identical copy and leaves every later one for a person, never dropped', () => {
    const matched = matchRows([cash, { ...cash, index: 5 }, { ...cash, index: 9, description: 'nop tien mat esta-7k2qx9mp' }], invoices);
    expect(matched.map((m) => m.match)).toEqual([once, repeat('inv-huong'), repeat('inv-huong')]);
    expect(new Set(matched.map((m) => m.fingerprint)).size).toBe(3);
  });

  it('leaves a later copy of a suggestion or an ambiguous row for a person with the same candidates', () => {
    const named = row({ description: 'NGUYEN THI HUONG DEMO CK', bankRef: '' });
    expect(matchRows([named, { ...named, index: 2 }], invoices).map((m) => m.match)).toEqual([
      { status: 'suggested', invoiceId: 'inv-huong' },
      repeat('inv-huong'),
    ]);
    const both = row({ description: 'ESTA Q4N8R2TV ESTA 7K2QX9MP', bankRef: '' });
    expect(matchRows([both, { ...both, index: 2 }], invoices)[1]?.match).toEqual(repeat('inv-huong', 'inv-khoa'));
  });

  it('keeps a later copy of a debit ignored as a debit', () => {
    const fee = row({ description: 'PHI SMS', amount: vnd(-11_000), bankRef: '' });
    expect(matchRows([fee, { ...fee, index: 2 }], invoices).map((m) => m.match)).toEqual([
      { status: 'ignored', reason: 'debit' },
      { status: 'ignored', reason: 'debit' },
    ]);
  });

  it('leaves a new copy for a person when an earlier import holds only the first', () => {
    const known = new Set(matchRows([cash], invoices).map((m) => m.fingerprint));
    expect(matchRows([cash, { ...cash, index: 2 }], invoices, { knownFingerprints: known }).map((m) => m.match)).toEqual([
      duplicate,
      repeat('inv-huong'),
    ]);
  });
});
