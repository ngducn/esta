import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { EXPENSE_CATEGORY_IDS } from '../expenses';
import { vnd } from '../money/vnd';
import { buildLedger } from './buildLedger';
import { ledgerToExportTable, type LedgerLabels } from './table';

const labels: LedgerLabels = {
  month: 'Tháng',
  monthName: (first) => `T${Number(first.slice(5, 7))}`,
  income: 'Thu',
  expenses: 'Tổng chi',
  noi: 'Còn lại',
  total: 'Cả năm',
  category: (id) => `chi:${id}`,
};

const ledger = buildLedger({
  incomes: [{ receivedOn: isoDate('2026-02-03'), amountVnd: vnd(5_000_000) }],
  expenses: [
    { paidOn: isoDate('2026-02-10'), category: 'utility', amountVnd: vnd(400_000) },
    { paidOn: isoDate('2026-03-01'), category: 'repair', amountVnd: vnd(1_000_000) },
  ],
  from: isoDate('2026-01-01'),
  to: isoDate('2026-03-31'),
});
const table = ledgerToExportTable(ledger, labels);
const values = (cells: readonly { value: unknown }[]) => cells.map((cell) => cell.value);

describe('ledgerToExportTable', () => {
  it('has a column for each category the range spent on, in the sheet order', () => {
    const order = EXPENSE_CATEGORY_IDS.filter((id) => id === 'repair' || id === 'utility');
    expect(table.columns.map((column) => column.id)).toEqual(['month', 'income', ...order, 'expenses', 'noi']);
    expect(table.columns.map((column) => column.label)).toEqual(['Tháng', 'Thu', ...order.map((id) => `chi:${id}`), 'Tổng chi', 'Còn lại']);
  });

  it('writes one row per month, keyed by its year and month', () => {
    expect(table.rows.map((row) => row.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(values(table.rows[1]?.cells ?? [])).toEqual(['T2', 5_000_000, 0, 400_000, 400_000, 4_600_000]);
  });

  it('ends with the totals, the sum of the months in every amount column', () => {
    expect(values(table.totals.cells)).toEqual(['Cả năm', 5_000_000, 1_000_000, 400_000, 1_400_000, 3_600_000]);
    table.columns.forEach((column, index) => {
      if (column.id === 'month') return;
      const sum = table.rows.reduce((total, row) => total + Number(row.cells[index]?.value), 0);
      expect(table.totals.cells[index]?.value, column.id).toBe(sum);
    });
  });
});
