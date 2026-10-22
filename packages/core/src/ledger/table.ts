import type { IsoDate } from '../date/iso-date';
import { EXPENSE_CATEGORY_IDS, type ExpenseCategory } from '../expenses';
import { textCell, vndCell, type ExportCell, type ExportTable } from '../export/table';
import type { Ledger, LedgerSums } from './buildLedger';

export type LedgerLabels = {
  readonly month: string;
  readonly monthName: (first: IsoDate) => string;
  readonly income: string;
  readonly expenses: string;
  readonly noi: string;
  readonly total: string;
  readonly category: (id: ExpenseCategory) => string;
};

/** The ledger as the Thu chi tab, its CSV and its spreadsheet show it: a column only for the categories the range spent on. */
export function ledgerToExportTable(ledger: Ledger, labels: LedgerLabels): ExportTable {
  const categories = EXPENSE_CATEGORY_IDS.filter((id) => ledger.totals.byCategory[id] !== 0);
  const amounts = (sums: LedgerSums): ExportCell[] => [
    vndCell(sums.incomeVnd),
    ...categories.map((id) => vndCell(sums.byCategory[id])),
    vndCell(sums.expensesVnd),
    vndCell(sums.noiVnd),
  ];
  return {
    columns: [
      { id: 'month', label: labels.month },
      { id: 'income', label: labels.income },
      ...categories.map((id) => ({ id, label: labels.category(id) })),
      { id: 'expenses', label: labels.expenses },
      { id: 'noi', label: labels.noi },
    ],
    rows: ledger.months.map((row) => ({ key: row.month.slice(0, 7), cells: [textCell(labels.monthName(row.month)), ...amounts(row)] })),
    totals: { key: 'total', cells: [textCell(labels.total), ...amounts(ledger.totals)] },
  };
}
