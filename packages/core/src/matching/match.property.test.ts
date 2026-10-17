import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { daysBetween } from '../date/calendar';
import { isoDate, type IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { foldVietnamese } from '../search/fold';
import type { StatementRow } from './decode';
import { SUGGESTION_WINDOW_DAYS, matchRows, type InvoiceCandidate, type StatementMatch } from './match';
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
  referenced: boolean;
};

const recipe: fc.Arbitrary<Recipe> = fc.record({
  pick: fc.nat(),
  kind: fc.constantFrom('memo', 'memo_noise', 'name_amount', 'name_only', 'amount_only', 'noise', 'debit', 'unissued'),
  offset: fc.integer({ min: -SUGGESTION_WINDOW_DAYS - 3, max: SUGGESTION_WINDOW_DAYS + 3 }),
  other: money,
  unissued: code,
  index: fc.nat({ max: 400 }),
  referenced: fc.boolean(),
});

function rowFrom(r: Recipe, invoices: InvoiceCandidate[]): StatementRow {
  const invoice = invoices[r.pick % invoices.length] as InvoiceCandidate;
  const base = { index: r.index, date: shiftDays(invoice.dueDate, r.offset), amount: invoice.outstanding, bankRef: r.referenced ? `FT${r.index}` : '' };
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

const withCopies = (rows: StatementRow[], picks: number[]): StatementRow[] =>
  rows.length === 0 ? rows : [...rows, ...picks.map((pick, i) => ({ ...(rows[pick % rows.length] as StatementRow), index: 1000 + i }))];

const scenario = invoiceSet.chain((invoices) =>
  fc.record({
    invoices: fc.constant(invoices),
    rows: fc
      .tuple(fc.array(recipe, { maxLength: 12 }), fc.array(fc.nat(), { maxLength: 4 }))
      .map(([recipes, picks]) => withCopies(recipes.map((r) => rowFrom(r, invoices)), picks)),
  }),
);

const transferKey = (row: StatementRow): string =>
  row.bankRef === '' ? `row ${row.date} ${row.amount} ${normalizeDescription(row.description)}` : `ref ${row.date} ${row.amount} ${row.bankRef}`;

const candidatesOf = (match: StatementMatch): readonly string[] =>
  match.status === 'unmatched' ? match.candidateIds : 'invoiceId' in match ? [match.invoiceId] : [];

const byId = (invoices: InvoiceCandidate[], id: string): InvoiceCandidate => {
  const found = invoices.find((invoice) => invoice.id === id);
  if (found === undefined) throw new Error(`unknown invoice ${id}`);
  return found;
};

function namesTenant(description: string, tenantName: string): boolean {
  const name = normalizeDescription(tenantName);
  const words = foldVietnamese(description).toUpperCase().split(/[^A-Z0-9]+/).filter((word) => word !== '');
  for (let first = 0; first < words.length; first++) {
    let joined = '';
    for (let last = first; last < words.length && joined.length < name.length; last++) {
      joined += words[last];
      if (joined === name) return true;
    }
  }
  return false;
}

function suggestionCandidates(row: StatementRow, invoices: InvoiceCandidate[]): InvoiceCandidate[] {
  return invoices.filter(
    (invoice) =>
      invoice.outstanding === row.amount &&
      namesTenant(row.description, invoice.tenantName) &&
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
          if (row.amount <= 0) expect(match.status).toBe('ignored');
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
        for (const { row, match } of matchRows(rows, invoices)) {
          if (row.amount <= 0 || match.status === 'ignored' || 'repeatOf' in match) continue;
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

  it('matches the first copy of a transfer alone, ignores a referenced repeat and leaves an unreferenced repeat for a person', () => {
    fc.assert(
      fc.property(scenario, ({ invoices, rows }) => {
        const matched = matchRows(rows, invoices);
        const first = new Map<string, number>();
        matched.forEach(({ row, fingerprint, match }, i) => {
          const key = transferKey(row);
          const alone = matchRows([row], invoices)[0]?.match as StatementMatch;
          const earlier = first.get(key);
          if (earlier === undefined) {
            first.set(key, i);
            expect(match).toEqual(alone);
            return;
          }
          const original = matched[earlier] as (typeof matched)[number];
          if (row.bankRef !== '') {
            expect(match).toEqual({ status: 'ignored', reason: 'duplicate' });
            expect(fingerprint).toBe(original.fingerprint);
          } else if (alone.status === 'ignored') {
            expect(match).toEqual(alone);
          } else {
            expect(match).toEqual({ status: 'unmatched', candidateIds: candidatesOf(alone), repeatOf: original.row.index });
          }
        });
      }),
      params,
    );
  });

  it('posts or suggests each transfer at most once across overlapping imports, and matches nothing on a re-import', () => {
    fc.assert(
      fc.property(scenario, fc.nat(), fc.nat(), ({ invoices, rows }, cut, overlap) => {
        const end = rows.length === 0 ? 0 : cut % (rows.length + 1);
        const start = end === 0 ? 0 : overlap % (end + 1);
        const known = new Set<string>();
        const taken = new Map<string, number>();
        for (const file of [rows.slice(0, end), rows.slice(start), rows]) {
          const matched = matchRows(file, invoices, { knownFingerprints: known });
          for (const { row, fingerprint, match } of matched) {
            if (match.status === 'memo_match' || match.status === 'suggested') {
              const key = transferKey(row);
              taken.set(key, (taken.get(key) ?? 0) + 1);
            }
            known.add(fingerprint);
          }
        }
        for (const [key, count] of taken) expect(count, key).toBe(1);
        const again = matchRows(rows, invoices, { knownFingerprints: known });
        for (const m of again) expect(m.match).toEqual({ status: 'ignored', reason: 'duplicate' });
      }),
      params,
    );
  });

  it('never ignores an unreferenced row of a fresh import as a duplicate', () => {
    fc.assert(
      fc.property(scenario, ({ invoices, rows }) => {
        for (const { row, match } of matchRows(rows, invoices)) {
          if (row.bankRef === '') expect(match).not.toEqual({ status: 'ignored', reason: 'duplicate' });
        }
      }),
      params,
    );
  });

  it('names only real invoices as candidates, each once, and exactly one only for a repeat', () => {
    fc.assert(
      fc.property(scenario, ({ invoices, rows }) => {
        for (const { match } of matchRows(rows, invoices)) {
          if (match.status !== 'unmatched') continue;
          if (!('repeatOf' in match)) expect(match.candidateIds).not.toHaveLength(1);
          expect(new Set(match.candidateIds).size).toBe(match.candidateIds.length);
          for (const id of match.candidateIds) byId(invoices, id);
        }
      }),
      params,
    );
  });
});
