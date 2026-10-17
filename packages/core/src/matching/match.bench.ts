import { expect, test } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { decodeStatement, type StatementRow } from './decode';
import { STATEMENT_LAYOUTS } from './layouts';
import { matchRows, type InvoiceCandidate } from './match';
import { renderStatementGrid } from './render';

const MATCH_BUDGET_MS = 50;
const DECODE_BUDGET_MS = 100;

const NAMES = ['Nguyễn Thị Hường Demo', 'Trần Văn Khoa Demo', 'Lê Minh Demo', 'Phạm Thu Hà Demo', 'Hoàng Anh Demo'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (n: number): string => Array.from({ length: 8 }, (_, i) => ALPHABET[Math.floor(n / 32 ** i) % 32]).join('');
const day = (n: number, after = 0): string => `2026-10-${String((n % 20) + 1 + after).padStart(2, '0')}`;

const invoices: InvoiceCandidate[] = Array.from({ length: 500 }, (_, i) => ({
  id: `inv-${i}`,
  memoCode: code(i),
  tenantName: `${NAMES[i % NAMES.length] as string} P${String(i).padStart(3, '0')}`,
  dueDate: isoDate(day(i)),
  outstanding: vnd(((i % 9) + 1) * 500_000),
}));

const rows: StatementRow[] = Array.from({ length: 1000 }, (_, i) => {
  const invoice = invoices[i % invoices.length] as InvoiceCandidate;
  const description =
    i % 3 === 0
      ? `MBVCB.${i}.ESTA${invoice.memoCode}.CT TU 0903`
      : i % 3 === 1
        ? `${invoice.tenantName.toUpperCase()} CHUYEN TIEN PHONG ${i}`
        : `PHI DICH VU ${i}`;
  return { index: i + 1, date: isoDate(day(i % invoices.length, 3)), amount: vnd(i % 3 === 2 ? -11_000 : invoice.outstanding), description, bankRef: `FT${i}` };
});

const gridB = renderStatementGrid(STATEMENT_LAYOUTS.b, rows);

test('the bench statement holds a third memo matches, a third suggestions and a third debits', () => {
  const statuses = matchRows(rows, invoices).map(({ match }) => match.status);
  const count = (status: string) => statuses.filter((s) => s === status).length;
  expect([count('memo_match'), count('suggested'), count('ignored')]).toEqual([334, 333, 333]);
  const decoded = decodeStatement(gridB);
  expect(decoded.ok && decoded.value.rows).toEqual(rows);
});

test('matchRows on 1,000 rows against 500 invoices and decoding the layout B grid stay under budget', async ({ bench }) => {
  const results = await bench.compare(
    bench('matchRows 1000x500', () => {
      matchRows(rows, invoices);
    }),
    bench('decodeStatement layout B 1000 rows', () => {
      decodeStatement(gridB);
    }),
  );
  const matchMedian = results.get('matchRows 1000x500').latency.p50;
  const decodeMedian = results.get('decodeStatement layout B 1000 rows').latency.p50;
  expect(matchMedian, `matchRows median ${matchMedian.toFixed(2)} ms`).toBeLessThan(MATCH_BUDGET_MS);
  expect(decodeMedian, `decode median ${decodeMedian.toFixed(2)} ms`).toBeLessThan(DECODE_BUDGET_MS);
});
