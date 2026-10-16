import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { daysBetween } from '../date/calendar';
import { isoDate, type IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import type { StatementRow } from './decode';
import { SUGGESTION_WINDOW_DAYS, matchRows, type InvoiceCandidate } from './match';
import { normalizeDescription } from './memo';

const params = { seed: 20261007, numRuns: 500 };

const code = fc.stringMatching(/^[A-Z0-9]{8}$/);
const date = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => isoDate(d.toISOString().slice(0, 10)));
const name = fc.constantFrom('Nguyễn Thị Hường Demo', 'Trần Văn Khoa Demo', 'Lê Minh Demo', 'Phạm Thu Hà Demo', 'Hoàng Anh Demo');
const money = fc.constantFrom(850_000, 1_500_000, 3_500_000, 4_200_000, 12_000_000).map(vnd);

const invoiceSet: fc.Arbitrary<InvoiceCandidate[]> = fc
  .uniqueArray(fc.record({ memoCode: code, tenantName: name, dueDate: date, outstanding: fc.oneof(money, fc.constant(vnd(0))) }), {
    selector: (invoice) => invoice.memoCode,
    minLength: 1,
    maxLength: 6,
  })
  .map((list) => list.map((invoice, i) => ({ ...invoice, id: `inv-${i}` })));

const shiftDays = (from: IsoDate, days: number): IsoDate => {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d.toISOString().slice(0, 10));
};

const asBank = (text: string): string => normalizeDescription(text).replace(/(.{5})/g, '$1 ').trim();

type Recipe = {
  pick: number;
  kind: 'memo' | 'memo_noise' | 'name_amount' | 'name_only' | 'amount_only' | 'noise' | 'debit' | 'unissued';
  offset: number;
  other: Vnd;
  unissued: string;
  index: number;
};

const recipe: fc.Arbitrary<Recipe> = fc.record({
  pick: fc.nat(),
  kind: fc.constantFrom('memo', 'memo_noise', 'name_amount', 'name_only', 'amount_only', 'noise', 'debit', 'unissued'),
  offset: fc.integer({ min: -SUGGESTION_WINDOW_DAYS - 3, max: SUGGESTION_WINDOW_DAYS + 3 }),
  other: money,
  unissued: code,
  index: fc.nat({ max: 400 }),
});

function rowFrom(r: Recipe, invoices: InvoiceCandidate[]): StatementRow {
  const invoice = invoices[r.pick % invoices.length] as InvoiceCandidate;
  const base = { index: r.index, date: shiftDays(invoice.dueDate, r.offset), amount: invoice.outstanding, bankRef: `FT${r.index}` };
  switch (r.kind) {
    case 'memo':
      return { ...base, description: `ESTA ${invoice.memoCode}` };
    case 'memo_noise':
      return { ...base, amount: r.other, description: `MBVCB.${r.index}.ESTA${invoice.memoCode}.CT TU ${asBank(invoice.tenantName)}` };
    case 'name_amount':
      return { ...base, description: `${asBank(invoice.tenantName)} CHUYEN TIEN` };
    case 'name_only':
      return { ...base, amount: r.other, description: `${asBank(invoice.tenantName)} CHUYEN TIEN` };
    case 'amount_only':
      return { ...base, description: `CHUYEN TIEN PHONG ${r.index}` };
    case 'noise':
      return { ...base, amount: r.other, description: `CAFE FIESTA ${r.index}` };
    case 'debit':
      return { ...base, amount: vnd(-Math.max(1, r.other)), description: `ESTA ${invoice.memoCode} ${asBank(invoice.tenantName)}` };
    case 'unissued':
      return { ...base, description: `ESTA ${r.unissued} ${asBank(invoice.tenantName)}` };
  }
}

const scenario = invoiceSet.chain((invoices) =>
  fc.record({ invoices: fc.constant(invoices), rows: fc.array(recipe, { maxLength: 12 }).map((rs) => rs.map((r) => rowFrom(r, invoices))) }),
);

const byId = (invoices: InvoiceCandidate[], id: string): InvoiceCandidate => {
  const found = invoices.find((invoice) => invoice.id === id);
  if (found === undefined) throw new Error(`unknown invoice ${id}`);
  return found;
};

function suggestionCandidates(row: StatementRow, invoices: InvoiceCandidate[]): InvoiceCandidate[] {
  const description = normalizeDescription(row.description);
  return invoices.filter(
    (invoice) =>
      invoice.outstanding === row.amount &&
      normalizeDescription(invoice.tenantName) !== '' &&
      description.includes(normalizeDescription(invoice.tenantName)) &&
      Math.abs(daysBetween(invoice.dueDate, row.date)) <= SUGGESTION_WINDOW_DAYS,
  );
}

const shuffle = <T>(list: readonly T[], seedList: number[]): T[] =>
  list
    .map((item, i) => ({ item, key: seedList[i % Math.max(1, seedList.length)] ?? 0 }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);

describe('matchRows properties', () => {
  it('is deterministic and does not depend on the order of the invoices', () => {
    fc.assert(
      fc.property(scenario, fc.array(fc.nat(), { minLength: 1, maxLength: 6 }), ({ invoices, rows }, keys) => {
        const first = matchRows(rows, invoices);
        expect(matchRows(rows, invoices)).toEqual(first);
        expect(matchRows(rows, shuffle(invoices, keys))).toEqual(first);
      }),
      params,
    );
  });

  it('never matches a row that brings no money in', () => {
    fc.assert(
      fc.property(scenario, ({ invoices, rows }) => {
        for (const { row, match } of matchRows(rows, invoices)) {
          if (row.amount <= 0) expect(match).toEqual({ status: 'ignored', reason: 'debit' });
        }
      }),
      params,
    );
  });

  it('gives every memo_match an issued code that the description carries and the invoice owns', () => {
    fc.assert(
      fc.property(scenario, ({ invoices, rows }) => {
        for (const { row, match } of matchRows(rows, invoices)) {
          if (match.status !== 'memo_match') continue;
          expect(byId(invoices, match.invoiceId).memoCode).toBe(match.memoCode);
          expect(normalizeDescription(row.description)).toContain(`ESTA${match.memoCode}`);
          expect(row.amount).toBeGreaterThan(0);
        }
      }),
      params,
    );
  });

  it('suggests exactly when one invoice fits the amount, name and window, and lists the candidates otherwise', () => {
    fc.assert(
      fc.property(scenario, ({ invoices, rows }) => {
        const issued = new Set(invoices.map((invoice) => invoice.memoCode));
        const seen = new Set<string>();
        for (const { row, fingerprint, match } of matchRows(rows, invoices)) {
          const duplicate = seen.has(fingerprint);
          seen.add(fingerprint);
          if (duplicate || row.amount <= 0) continue;
          const codes = [...issued].filter((c) => normalizeDescription(row.description).includes(`ESTA${c}`));
          if (codes.length > 0) continue;
          const fitting = suggestionCandidates(row, invoices);
          if (fitting.length === 1) expect(match).toEqual({ status: 'suggested', invoiceId: fitting[0]?.id });
          else expect(match).toEqual({ status: 'unmatched', candidateIds: expect.arrayContaining(fitting.map((i) => i.id)) });
          if (match.status === 'unmatched') expect(match.candidateIds).toHaveLength(fitting.length);
        }
      }),
      params,
    );
  });

  it('ignores a repeated row as a duplicate and matches nothing on a re-import', () => {
    fc.assert(
      fc.property(scenario, ({ invoices, rows }) => {
        const first = matchRows(rows, invoices);
        const fingerprints = first.map((m) => m.fingerprint);
        const seenBefore = (i: number) => fingerprints.slice(0, i).includes(fingerprints[i] as string);
        first.forEach((m, i) => {
          if (seenBefore(i)) expect(m.match).toEqual({ status: 'ignored', reason: 'duplicate' });
          else expect(m.match).not.toEqual({ status: 'ignored', reason: 'duplicate' });
        });
        const again = matchRows(rows, invoices, { knownFingerprints: new Set(fingerprints) });
        for (const m of again) expect(m.match).toEqual({ status: 'ignored', reason: 'duplicate' });
        expect(again.map((m) => m.fingerprint)).toEqual(fingerprints);
      }),
      params,
    );
  });

  it('names only real invoices as candidates, each once, and never exactly one', () => {
    fc.assert(
      fc.property(scenario, ({ invoices, rows }) => {
        for (const { match } of matchRows(rows, invoices)) {
          if (match.status !== 'unmatched') continue;
          expect(match.candidateIds).not.toHaveLength(1);
          expect(new Set(match.candidateIds).size).toBe(match.candidateIds.length);
          for (const id of match.candidateIds) byId(invoices, id);
        }
      }),
      params,
    );
  });
});
