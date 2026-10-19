import { describe, expect, it } from 'vitest';
import { isoDate as d, type IsoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { schedulePeriods } from '../schedule/fixtures';
import { leaseTimeline, type TimelineInvoice } from './timeline';

const invoice = (start: string, status: TimelineInvoice['status'], outstanding: number, paymentStatus: TimelineInvoice['paymentStatus'] = outstanding === 0 ? 'paid' : 'unpaid'): TimelineInvoice => ({
  id: `invoice-${start}`,
  periodStart: d(start),
  periodEnd: d(`${start.slice(0, 8)}24`),
  dueDate: d(start),
  status,
  totalVnd: vnd(2_800_000),
  outstandingVnd: vnd(outstanding),
  paymentStatus,
});

/**
 * Phòng 5 from 25/02/2026, paid through 24/05, as `lease_schedule` returns it: each period names the live invoice whose
 * start falls in it.
 */
function phong5(count: number, invoices: readonly TimelineInvoice[]) {
  return schedulePeriods('phong-5', '2026-02-25', 2_800_000, count).map((period) => ({
    ...period,
    coveredByPaidThrough: period.end <= '2026-05-24',
    invoiceId: invoices.find((candidate) => candidate.status !== 'void' && candidate.periodStart >= period.start && candidate.periodStart <= period.end)?.id ?? null,
  }));
}

const marks = (asOf: IsoDate, invoices: readonly TimelineInvoice[]) =>
  leaseTimeline(phong5(10, invoices), invoices, asOf).map((row) => `${row.start} ${row.mark.kind}${row.mark.kind === 'overdue' ? ` ${row.mark.days}` : ''}`);

describe('leaseTimeline (P3-08 period marks)', () => {
  it('shows Phòng 5 on 2026-10-07: collected before Esta, paid, September 12 days overdue, October not yet due, November scheduled', () => {
    const invoices = [
      invoice('2026-05-25', 'issued', 0),
      invoice('2026-06-25', 'issued', 0),
      invoice('2026-07-25', 'issued', 0),
      invoice('2026-08-25', 'issued', 0),
      invoice('2026-09-25', 'issued', 2_800_000),
      invoice('2026-10-25', 'issued', 2_800_000),
    ];
    expect(marks(d('2026-10-07'), invoices)).toEqual([
      '2026-02-25 prepaid',
      '2026-03-25 prepaid',
      '2026-04-25 prepaid',
      '2026-05-25 paid',
      '2026-06-25 paid',
      '2026-07-25 paid',
      '2026-08-25 paid',
      '2026-09-25 overdue 12',
      '2026-10-25 upcoming',
      '2026-11-25 upcoming',
    ]);
  });

  it('marks a draft, a part payment, a period due today, and a period whose invoice is void as upcoming', () => {
    const invoices = [invoice('2026-09-25', 'issued', 800_000, 'partial'), invoice('2026-10-25', 'draft', 2_800_000), invoice('2026-11-25', 'void', 2_800_000)];
    expect(marks(d('2026-09-25'), invoices).slice(7)).toEqual(['2026-09-25 partial', '2026-10-25 draft', '2026-11-25 upcoming']);
    expect(marks(d('2026-09-25'), [invoice('2026-09-25', 'issued', 2_800_000)]).at(7)).toBe('2026-09-25 due');
    expect(marks(d('2026-09-26'), invoices).at(7)).toBe('2026-09-25 overdue 1');
  });

  it('takes the dates and total of an invoice that bills part of its period, and calls a past period with no invoice unbilled', () => {
    const partOf = { ...invoice('2026-06-25', 'issued', 0), periodStart: d('2026-07-01'), periodEnd: d('2026-07-24'), totalVnd: vnd(2_240_000) };
    const rows = leaseTimeline(phong5(6, [partOf]), [partOf], d('2026-10-07'));
    expect(rows.at(3)).toMatchObject({ start: '2026-05-25', invoice: null, mark: { kind: 'unbilled' } });
    expect(rows.at(4)).toMatchObject({ start: '2026-07-01', end: '2026-07-24', amountVnd: 2_240_000, mark: { kind: 'paid' } });
  });
});
