import type { IsoDate } from '../date/iso-date';
import { textCell, vndCell, type ExportCell, type ExportTable } from '../export/table';
import { vnd } from '../money/vnd';
import { monthsOf, type ReportInvoice, type ReportSnapshot } from './snapshot';

export type CollectionsLabels = {
  readonly month: string;
  readonly monthName: (first: IsoDate) => string;
  readonly billed: string;
  readonly collected: string;
  readonly outstanding: string;
  readonly total: string;
};

const amounts = (invoices: readonly ReportInvoice[]): ExportCell[] =>
  (['totalVnd', 'allocatedVnd', 'outstandingVnd'] as const).map((field) => vndCell(vnd(invoices.reduce((sum, invoice) => sum + invoice[field], 0))));

/**
 * FIN-4: the issued invoices due in each month of the period, keyed `YYYY-MM`: what they billed, what payments allocated to
 * them, and what is still owed on them now, so an unpaid September bill stays in September's row after September ends.
 */
export function monthlyCollections(snapshot: ReportSnapshot, labels: CollectionsLabels): ExportTable {
  const issued = snapshot.invoices.filter((invoice) => invoice.status === 'issued' && invoice.dueDate >= snapshot.from && invoice.dueDate <= snapshot.to);
  return {
    columns: [
      { id: 'month', label: labels.month },
      { id: 'billed', label: labels.billed },
      { id: 'collected', label: labels.collected },
      { id: 'outstanding', label: labels.outstanding },
    ],
    rows: monthsOf(snapshot.from, snapshot.to).map((first) => ({
      key: first.slice(0, 7),
      cells: [textCell(labels.monthName(first)), ...amounts(issued.filter((invoice) => invoice.dueDate.startsWith(first.slice(0, 7))))],
    })),
    totals: { key: 'total', cells: [textCell(labels.total), ...amounts(issued)] },
  };
}
