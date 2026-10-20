import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { StatementRow } from './decode';
import { planImport, type ImportInvoice } from './import';
import { SCENARIO_INVOICES, SCENARIO_ROWS } from './statement-scenario';

const issued: ImportInvoice[] = SCENARIO_INVOICES.map((invoice) => ({ ...invoice, status: 'issued' }));
const rows: StatementRow[] = SCENARIO_ROWS.map(({ expect: _expect, ...row }, i) => ({ index: i + 1, ...row }));

const row = (description: string, amount: number, date = '2026-10-04', bankRef = 'FT1'): StatementRow => ({
  index: 1,
  date: isoDate(date),
  amount: vnd(amount),
  description,
  bankRef,
});

describe('planImport', () => {
  it('stores each scenario row with the status matchRows gives it', () => {
    const plan = planImport(rows, issued, new Set());
    expect(plan.known).toEqual([]);
    expect(plan.rows.map((stored) => [stored.status, stored.reason, stored.invoiceId])).toEqual([
      ['memo_match', null, 'inv-dian-p3-202610'],
      ['memo_match', null, 'inv-dian-p5-202610'],
      ['memo_match', null, 'inv-dian-p8-202610'],
      ['unmatched', null, null],
      ['memo_match', null, 'inv-dian-p7-202610'],
      ['suggested', null, 'inv-baoloc-nha-202610'],
      ['unmatched', null, null],
      ['ignored', 'debit', null],
      ['ignored', 'debit', null],
      ['unmatched', null, null],
      ['unmatched', null, null],
      ['ignored', 'duplicate', null],
      ['memo_match', null, 'inv-baoloc-nha-202610'],
      ['unmatched', 'repeat', null],
    ]);
    expect(plan.rows[6]?.candidateIds).toEqual(['inv-dian-p5-202610', 'inv-dian-p8-202610']);
    expect(plan.rows[13]?.candidateIds).toEqual(['inv-baoloc-nha-202610']);
  });

  it('leaves out every line an earlier import holds, so a re-import stores nothing', () => {
    const first = planImport(rows, issued, new Set());
    const again = planImport(rows, issued, new Set(first.rows.map((stored) => stored.fingerprint)));
    expect(again.rows).toEqual([]);
    expect(again.known).toHaveLength(rows.length);
  });

  it('keeps the new lines of an overlapping export and counts the rest as known', () => {
    const first = planImport(rows.slice(0, 5), issued, new Set());
    const later = planImport(rows, issued, new Set(first.rows.map((stored) => stored.fingerprint)));
    expect(later.known).toHaveLength(6);
    expect(later.rows.map((stored) => stored.row.index)).toEqual(rows.slice(5).filter((r) => r.index !== 12).map((r) => r.index));
  });

  it('stores a memo naming a paid or a void bill as a memo match, for the database to hold, and never suggests a void bill', () => {
    const voided = issued.map((invoice): ImportInvoice => (invoice.id === 'inv-dian-p3-202610' ? { ...invoice, status: 'void' } : invoice));
    const plan = planImport(
      [row('ESTA N5P9R3SQ HOANG ANH DEMO', 2_500_000), row('ESTA 7K2QX9MP', 3_500_000, '2026-10-04', 'FT2'), row('NGUYEN THI HUONG DEMO CK', 3_500_000, '2026-10-02', 'FT3')],
      voided,
      new Set(),
    );
    expect(plan.rows.map((stored) => [stored.status, stored.invoiceId])).toEqual([
      ['memo_match', 'inv-dian-p1-202609'],
      ['memo_match', 'inv-dian-p3-202610'],
      ['unmatched', null],
    ]);
  });
});
