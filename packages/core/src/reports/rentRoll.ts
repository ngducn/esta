import type { IsoDate } from '../date/iso-date';
import { textCell, vndCell, type ExportTable } from '../export/table';
import { collectedThrough } from '../lease/collected';
import { currentMonthlyRent } from '../lease/monthlyRent';
import { vnd } from '../money/vnd';
import { inRentRoll, type ReportSnapshot } from './snapshot';

export type RentRollLabels = {
  readonly place: string;
  readonly tenant: string;
  readonly rent: string;
  readonly cycle: string;
  readonly paidThrough: string;
  readonly nextDue: string;
  readonly deposit: string;
  readonly endDate: string;
  readonly total: string;
  readonly placeName: (unit: string, property: string) => string;
  readonly cycleMonths: (months: number) => string;
  readonly date: (date: IsoDate) => string;
  readonly none: string;
  readonly openEnded: string;
};

const collator = new Intl.Collator('vi', { numeric: true });

/**
 * FIN-4: every lease in effect on the snapshot's `asOf`, keyed by its id, with the monthly rent in force then, `Đã thu đến`,
 * the due date of the first period after it, the deposit held and the end date, and a totals row of rent and deposits.
 */
export function rentRoll(snapshot: ReportSnapshot, labels: RentRollLabels): ExportTable {
  const { asOf } = snapshot;
  const lines = snapshot.leases
    .filter((lease) => inRentRoll(lease, asOf))
    .toSorted((a, b) => collator.compare(a.propertyName, b.propertyName) || collator.compare(a.unitLabel, b.unitLabel))
    .map((lease) => {
      const periods = snapshot.schedule.filter((period) => period.leaseId === lease.id);
      const paidThrough = collectedThrough(
        lease.paid_through_date,
        snapshot.leaseInvoices.filter((invoice) => invoice.leaseId === lease.id),
      );
      const nextDue = periods.find((period) => paidThrough === null || period.start > paidThrough)?.dueDate ?? null;
      return { lease, rentVnd: currentMonthlyRent(periods, asOf) ?? lease.rent_vnd ?? vnd(0), paidThrough, nextDue };
    });
  const dateOrNone = (date: IsoDate | null) => textCell(date === null ? labels.none : labels.date(date));
  const sum = (amounts: readonly number[]) => vnd(amounts.reduce((total, amount) => total + amount, 0));
  return {
    columns: [
      { id: 'place', label: labels.place },
      { id: 'tenant', label: labels.tenant },
      { id: 'rent', label: labels.rent },
      { id: 'cycle', label: labels.cycle },
      { id: 'paidThrough', label: labels.paidThrough },
      { id: 'nextDue', label: labels.nextDue },
      { id: 'deposit', label: labels.deposit },
      { id: 'endDate', label: labels.endDate },
    ],
    rows: lines.map(({ lease, rentVnd, paidThrough, nextDue }) => ({
      key: lease.id,
      cells: [
        textCell(lease.wholeUnit ? lease.propertyName : labels.placeName(lease.unitLabel, lease.propertyName)),
        textCell(lease.tenantName ?? labels.none),
        vndCell(rentVnd),
        textCell(labels.cycleMonths(lease.billing_cycle_months)),
        dateOrNone(paidThrough),
        dateOrNone(nextDue),
        vndCell(lease.depositHeldVnd),
        textCell(lease.end_date === null ? labels.openEnded : labels.date(lease.end_date)),
      ],
    })),
    totals: {
      key: 'total',
      cells: [
        textCell(labels.total),
        textCell(''),
        vndCell(sum(lines.map((line) => line.rentVnd))),
        textCell(''),
        textCell(''),
        textCell(''),
        vndCell(sum(lines.map((line) => line.lease.depositHeldVnd))),
        textCell(''),
      ],
    },
  };
}
