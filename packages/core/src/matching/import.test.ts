import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { decodeStatement, type StatementRow } from './decode';
import { knownLines, planImport, type ImportInvoice, type PlannedImport, type StoredLine } from './import';
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

/** What an import stores, as the next import of the household reads it back. */
const storedFrom = (plan: PlannedImport, importId = 'import-1', sameAccount = true): StoredLine[] =>
  plan.rows.map(({ row: { date, amount, bankRef, description }, fingerprint }) => ({ date, amount, bankRef, description, fingerprint, importId, sameAccount }));

describe('planImport', () => {
  it('stores each scenario row with the status matchRows gives it', () => {
    const plan = planImport(rows, issued, []);
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
    const first = planImport(rows, issued, []);
    const again = planImport(rows, issued, storedFrom(first));
    expect(again.rows).toEqual([]);
    expect(again.known).toEqual(rows.map(() => 'import-1'));
  });

  it('keeps the new lines of an overlapping export and counts the rest as known', () => {
    const first = planImport(rows.slice(0, 5), issued, []);
    const later = planImport(rows, issued, storedFrom(first));
    expect(later.known).toHaveLength(6);
    expect(later.rows.map((stored) => stored.row.index)).toEqual(rows.slice(5).filter((r) => r.index !== 12).map((r) => r.index));
  });

  it('stores a memo naming a paid or a void bill as a memo match, for the database to hold, and never suggests a void bill', () => {
    const voided = issued.map((invoice): ImportInvoice => (invoice.id === 'inv-dian-p3-202610' ? { ...invoice, status: 'void' } : invoice));
    const plan = planImport(
      [row('ESTA N5P9R3SQ HOANG ANH DEMO', 2_500_000), row('ESTA 7K2QX9MP', 3_500_000, '2026-10-04', 'FT2'), row('NGUYEN THI HUONG DEMO CK', 3_500_000, '2026-10-02', 'FT3')],
      voided,
      [],
    );
    expect(plan.rows.map((stored) => [stored.status, stored.invoiceId])).toEqual([
      ['memo_match', 'inv-dian-p1-202609'],
      ['memo_match', 'inv-dian-p3-202610'],
      ['unmatched', null],
    ]);
  });
});

describe('knownLines: the same statement under other columns records nothing twice (P3-21)', () => {
  const withRefs = rows;
  const withoutRefs = rows.map((line) => ({ ...line, bankRef: '' }));
  const storedOf = (lines: readonly StatementRow[], importId = 'import-1', sameAccount = true) => storedFrom(planImport(lines, issued, []), importId, sameAccount);
  const plannedAfter = (lines: readonly StatementRow[], stored: readonly StoredLine[]) => planImport(lines, issued, stored);

  it('knows every line read again with the bank reference column picked, after a reading without it (lane 4), and the other way round', () => {
    expect(plannedAfter(withRefs, storedOf(withoutRefs)).rows).toEqual([]);
    expect(plannedAfter(withoutRefs, storedOf(withRefs)).rows).toEqual([]);
  });

  it('posts each transfer once over the labels, a mapping with the reference and one without, in every order', () => {
    const readings = [withRefs, withRefs.map((line) => ({ ...line, index: line.index + 4 })), withoutRefs];
    for (const order of [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ] as const) {
      const stored: StoredLine[] = [];
      const kept = order.map((at, n) => {
        const plan = plannedAfter(readings[at] ?? [], stored);
        stored.push(...storedFrom(plan, `import-${n + 1}`));
        return plan.rows.length;
      });
      expect(kept).toEqual([rows.length, 0, 0]);
    }
  });

  it('knows a line read under the value date instead of the transaction date: a Saturday transfer valued on Monday', () => {
    const saturday = [{ ...row('ESTA 7K2QX9MP', 3_500_000, '2026-10-03', 'FT26276002') }];
    const valuedOn = (date: string) => [{ ...row('ESTA 7K2QX9MP', 3_500_000, date, 'FT26276002') }];
    expect(knownLines(valuedOn('2026-10-05'), storedOf(saturday)).map((line) => line?.importId)).toEqual(['import-1']);
    expect(knownLines(valuedOn('2026-10-06'), storedOf(saturday)).map((line) => line?.importId)).toEqual(['import-1']);
    expect(knownLines(valuedOn('2026-09-30'), storedOf(saturday)).map((line) => line?.importId)).toEqual(['import-1']);
  });

  it('knows a line with the same reference and amount re-dated past the 30/4 break, up to 14 days away', () => {
    const first = storedOf([row('CK TIEN PHONG', 2_800_000, '2027-04-29', 'FT27119000123')]);
    const after = (amount: number, date: string, stored = first) => knownLines([row('CK TIEN PHONG', amount, date, 'FT27119000123')], stored).map((line) => line?.importId);
    expect(after(2_800_000, '2027-05-04')).toEqual(['import-1']);
    expect(after(2_800_000, '2027-05-13')).toEqual(['import-1']);
    expect(after(2_800_000, '2027-04-15')).toEqual(['import-1']);
    expect(after(2_800_000, '2027-05-14')).toEqual([undefined]);
    expect(after(2_500_000, '2027-04-29')).toEqual([undefined]);
    expect(after(2_800_000, '2027-05-04', storedOf([row('CK TIEN PHONG', 2_800_000, '2027-04-29', 'FT27119000123')], 'import-1', false))).toEqual([undefined]);
  });

  it('records the same reference and amount a month later as a new transfer, as when a bank reuses a short reference for the next rent', () => {
    const april = storedOf([row('CK TIEN PHONG', 2_800_000, '2027-04-29', 'FT27119000123')]);
    expect(knownLines([row('CK TIEN PHONG', 2_800_000, '2027-05-29', 'FT27119000123')], april)).toEqual([undefined]);
    expect(knownLines([row('CK TIEN PHONG', 2_800_000, '2027-03-29', 'FT27119000123')], april)).toEqual([undefined]);
  });

  it('keeps the window for lines whose references differ or that carry none', () => {
    const first = storedOf([row('CK TIEN PHONG', 2_800_000, '2027-04-29', 'FT27119000123')]);
    expect(knownLines([row('CK TIEN PHONG', 2_800_000, '2027-04-30', 'FT27120000456')], first)).toEqual([undefined]);
    const unreferenced = storedOf([row('CK TIEN PHONG', 2_800_000, '2027-04-29', '')]);
    expect(knownLines([row('CK TIEN PHONG', 2_800_000, '2027-05-02', '')], unreferenced).map((line) => line?.importId)).toEqual(['import-1']);
    expect(knownLines([row('CK TIEN PHONG', 2_800_000, '2027-05-04', '')], unreferenced)).toEqual([undefined]);
  });

  it('reads the same day from a date column with a time or without one, so the line is known', () => {
    const sheet = [
      ['Thời điểm', 'Ngày', 'Chi tiết', 'Phát sinh'],
      ['03/10/2026 21:40:00', '03/10/2026', 'ESTA Q4N8R2TV', '4.200.000'],
    ];
    const read = (date: number) => {
      const decoded = decodeStatement(sheet, { headerRow: 0, mapping: { date, description: 2, bankRef: null, amount: { kind: 'signed', amount: 3 } } });
      return decoded.ok ? decoded.value.rows : [];
    };
    expect(plannedAfter(read(1), storedOf(read(0))).rows).toEqual([]);
  });

  it('keeps two identical counter deposits as two, and knows them again only two at a time', () => {
    const deposit = row('NOP TIEN MAT ESTA H8J3K7LM PHAM THU HA DEMO', 6_000_000, '2026-10-09', '');
    const first = plannedAfter([deposit, { ...deposit, index: 2 }], []);
    expect(first.rows.map((stored) => [stored.status, stored.reason])).toEqual([
      ['memo_match', null],
      ['unmatched', 'repeat'],
    ]);
    const referenced = [
      { ...deposit, bankRef: 'FT1' },
      { ...deposit, index: 2, bankRef: 'FT2' },
      { ...deposit, index: 3, bankRef: 'FT3' },
    ];
    const again = plannedAfter(referenced, storedFrom(first));
    expect(again.known).toEqual(['import-1', 'import-1']);
    expect(again.rows.map((stored) => stored.row.bankRef)).toEqual(['FT3']);
  });

  it('compares the reference and the description only within the account, and a fingerprint across the household', () => {
    // The two counter deposits carry no reference in either reading, so their fingerprints match across accounts.
    const kept = plannedAfter(withRefs, storedOf(withoutRefs, 'import-1', false)).rows;
    expect(kept.map((stored) => stored.row.index)).toEqual(rows.filter((line) => line.bankRef !== '').map((line) => line.index));
    expect(plannedAfter(withRefs, storedOf(withRefs, 'import-1', false)).rows).toEqual([]);
  });

  it('knows a line first read without its reference on 05/10, read again under the value date 06/10 with the reference (lane 4)', () => {
    const first = storedOf([row('CK ESTAQ4N8R2TV DEMO', 1_000_000, '2026-10-05', '')]);
    expect(knownLines([row('CK ESTAQ4N8R2TV DEMO', 1_000_000, '2026-10-06', 'FT26279003')], first).map((line) => line?.importId)).toEqual(['import-1']);
  });

  it('knows a line of a bank with no reference column read under another date column 1 to 3 days off, and not 4', () => {
    const first = storedOf([row('NOP TIEN MAT PHONG 3 DEMO', 2_500_000, '2026-10-05', '')]);
    const on = (date: string) => knownLines([row('NOP TIEN MAT PHONG 3 DEMO', 2_500_000, date, '')], first)[0]?.importId;
    expect(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-07', '2026-10-08'].map(on)).toEqual(Array.from({ length: 6 }, () => 'import-1'));
    expect([on('2026-10-01'), on('2026-10-09')]).toEqual([undefined, undefined]);
  });

  it('records lines with different references as different transfers, whatever their descriptions', () => {
    const first = storedOf([row('CK TIEN PHONG', 2_800_000, '2026-10-05', 'FT2W009')]);
    expect(knownLines([row('CK TIEN PHONG', 2_800_000, '2026-10-05', 'FT2X009')], first)).toEqual([undefined]);
    expect(plannedAfter([row('CK TIEN PHONG', 2_800_000, '2026-10-05', 'FT2X009')], first).rows).toHaveLength(1);
  });

  it('counts two separate transfers without references, of one amount and description within 3 days, as one across statements (the trade-off)', () => {
    const first = storedOf([row('CK TIEN DIEN', 300_000, '2026-10-05', '')]);
    expect(knownLines([row('CK TIEN DIEN', 300_000, '2026-10-07', '')], first).map((line) => line?.importId)).toEqual(['import-1']);
  });

  it('answers each new line with an equal reference before a nearer line that only shares the description', () => {
    const first = storedOf([row('CK TIEN PHONG', 2_800_000, '2026-10-05', ''), { ...row('CK TIEN PHONG', 2_800_000, '2026-10-03', 'FT7'), index: 2 }]);
    const [line] = knownLines([row('CK TIEN PHONG', 2_800_000, '2026-10-05', 'FT7')], first);
    expect(line?.bankRef).toBe('FT7');
  });
});
