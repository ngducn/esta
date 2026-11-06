import type { IsoDate } from '../date/iso-date';
import { textCell, vndCell, type ExportCell, type ExportTable } from '../export/table';
import { vnd } from '../money/vnd';
import { monthCollected } from '../collections/group';
import { monthsOf, type ReportInvoice, type ReportSnapshot } from './snapshot';

export type CollectionsLabels = {
  readonly month: string;
  readonly monthName: (first: IsoDate) => string;
  readonly billed: string;
  readonly collected: string;
  readonly outstanding: string;
  readonly total: string;
};

/** The issued bills due in `month` (any day of it), whichever property they are on. */
export const billsDueIn = <B extends Pick<ReportInvoice, 'status' | 'dueDate'>>(invoices: readonly B[], month: IsoDate): B[] =>
  invoices.filter((invoice) => invoice.status === 'issued' && invoice.dueDate.startsWith(month.slice(0, 7)));

/** Billed and collected are `monthCollected`, the figure Tổng quan and Thu tiền show; what is owed is the sum of what each bill still owes. */
const amounts = (invoices: readonly ReportInvoice[]): ExportCell[] => {
  const { billedVnd, collectedVnd } = monthCollected(invoices);
  return [vndCell(billedVnd), vndCell(collectedVnd), vndCell(vnd(invoices.reduce((sum, invoice) => sum + invoice.outstandingVnd, 0)))];
};

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
      cells: [textCell(labels.monthName(first)), ...amounts(billsDueIn(issued, first))],
    })),
    totals: { key: 'total', cells: [textCell(labels.total), ...amounts(issued)] },
  };
}
