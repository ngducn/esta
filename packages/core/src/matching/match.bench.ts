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
const code = (n: number): string => Array.from({ length: 8 }, (_, i) => ALPHABET[(n * 7 + i * 13) % ALPHABET.length]).join('');
const day = (n: number): string => `2026-10-${String((n % 28) + 1).padStart(2, '0')}`;

const invoices: InvoiceCandidate[] = Array.from({ length: 500 }, (_, i) => ({
  id: `inv-${i}`,
  memoCode: code(i),
  tenantName: NAMES[i % NAMES.length] as string,
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
  return { index: i + 1, date: isoDate(day(i + 3)), amount: vnd(i % 3 === 2 ? -11_000 : invoice.outstanding), description, bankRef: `FT${i}` };
});

const gridB = renderStatementGrid(STATEMENT_LAYOUTS.b, rows);

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
