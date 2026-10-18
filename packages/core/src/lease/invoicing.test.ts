import { describe, expect, it } from 'vitest';
import { isoDate as d } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { planInvoices, type InvoicingLease } from './invoicing';

const monthly: InvoicingLease = {
  startDate: d('2026-08-01'),
  endDate: null,
  rentVnd: vnd(3_000_000),
  billingCycleMonths: 1,
  periodAnchor: 'calendar_month',
  firstPeriodProration: 'by_days',
  dueOffsetDays: 0,
  escalation: { kind: 'none' },
  paidThroughDate: d('2026-09-30'),
  utilitiesMode: 'tenant_direct',
};

const spans = (lease: InvoicingLease, asOf: string, readings = null as Parameters<typeof planInvoices>[3]) =>
  planInvoices(lease, [], d(asOf), readings).map((invoice) => `${invoice.periodStart}..${invoice.periodEnd} due ${invoice.dueDate} issue ${invoice.issueOn} ${invoice.lines.map((line) => line.amountVnd).join('+')}`);

describe('planInvoices (SPEC §5.4 generation)', () => {
  it('LSE-3: activating on 2026-10-07 paid through 2026-09-30 owes October, issued from 2026-10-01, and drafts November', () => {
    expect(spans(monthly, '2026-10-07')).toEqual([
      '2026-10-01..2026-10-31 due 2026-10-01 issue 2026-10-01 3000000',
      '2026-11-01..2026-11-30 due 2026-11-01 issue 2026-11-01 3000000',
    ]);
  });

  it('skips periods that ended before the as-of date even when nothing was marked paid', () => {
    expect(spans({ ...monthly, paidThroughDate: null }, '2026-10-07')[0]).toMatch(/^2026-10-01\.\.2026-10-31/);
  });

  it('owes nothing while paid_through_date covers the current period and no period starts within 35 days', () => {
    expect(spans({ ...monthly, startDate: d('2026-03-01'), billingCycleMonths: 12, paidThroughDate: d('2027-02-28') }, '2026-10-07')).toEqual([]);
  });

  it('bills a room from its move-in day when it is anchored on the lease start', () => {
    const room = { ...monthly, startDate: d('2026-10-07'), rentVnd: vnd(3_500_000), periodAnchor: 'lease_start', paidThroughDate: null, utilitiesMode: 'metered_by_owner' } as const;
    expect(spans(room, '2026-10-07')).toEqual([
      '2026-10-07..2026-11-06 due 2026-10-07 issue 2026-10-07 3500000',
      '2026-11-07..2026-12-06 due 2026-11-07 issue 2026-11-07 3500000',
    ]);
  });

  it('issues an owner-metered period as soon as the previous month readings are complete, never later than its due date', () => {
    const room = { ...monthly, startDate: d('2026-01-25'), periodAnchor: 'lease_start', paidThroughDate: d('2026-10-24'), utilitiesMode: 'metered_by_owner' } as const;
    const september = { month: d('2026-09-01'), completeOn: d('2026-10-03') };
    expect(spans(room, '2026-10-07', september)).toEqual(['2026-10-25..2026-11-24 due 2026-10-25 issue 2026-10-03 3000000']);
    expect(spans(room, '2026-10-07', { month: d('2026-08-01'), completeOn: d('2026-10-03') })).toEqual([
      '2026-10-25..2026-11-24 due 2026-10-25 issue 2026-10-25 3000000',
    ]);
    expect(spans(room, '2026-10-07', { month: d('2026-09-01'), completeOn: d('2026-10-28') })[0]).toContain('issue 2026-10-25');
  });

  it('prorates a first calendar month by days', () => {
    expect(spans({ ...monthly, startDate: d('2026-10-16'), paidThroughDate: null }, '2026-10-16')[0]).toBe(
      '2026-10-16..2026-10-31 due 2026-10-16 issue 2026-10-16 1548387',
    );
  });

  describe('a paid-through date inside a period bills only the uncollected days, due on the first of them', () => {
    const quarterly = { ...monthly, rentVnd: vnd(10_000_000), billingCycleMonths: 3 } as const;
    const annual = { ...monthly, startDate: d('2026-03-01'), rentVnd: vnd(30_000_000), billingCycleMonths: 12 } as const;
    const room = { ...monthly, startDate: d('2026-08-10'), periodAnchor: 'lease_start', utilitiesMode: 'metered_by_owner' } as const;

    it.each([
      ['monthly, on the period end', monthly, '2026-09-30', ['2026-10-01..2026-10-31 due 2026-10-01 issue 2026-10-01 3000000', '2026-11-01..2026-11-30 due 2026-11-01 issue 2026-11-01 3000000']],
      ['monthly, before the period end', monthly, '2026-10-15', ['2026-10-16..2026-10-31 due 2026-10-16 issue 2026-10-16 1548387', '2026-11-01..2026-11-30 due 2026-11-01 issue 2026-11-01 3000000']],
      ['monthly, after the period end', monthly, '2026-11-10', ['2026-11-11..2026-11-30 due 2026-11-11 issue 2026-11-11 2000000']],
      ['quarterly, on the period end', quarterly, '2026-10-31', ['2026-11-01..2027-01-31 due 2026-11-01 issue 2026-11-01 30000000']],
      ['quarterly, before the period end (lane 3)', quarterly, '2026-09-30', ['2026-10-01..2026-10-31 due 2026-10-01 issue 2026-10-01 10108696', '2026-11-01..2027-01-31 due 2026-11-01 issue 2026-11-01 30000000']],
      ['quarterly, after the period end', quarterly, '2026-11-15', ['2026-11-16..2027-01-31 due 2026-11-16 issue 2026-11-16 25108696']],
      ['annual, on the period end', annual, '2027-02-28', []],
      ['annual, before the period end', annual, '2026-09-30', ['2026-10-01..2027-02-28 due 2026-10-01 issue 2026-10-01 148931507']],
      ['annual, after the period end', annual, '2027-03-31', []],
      ['room from move-in, on the period end', room, '2026-10-09', ['2026-10-10..2026-11-09 due 2026-10-10 issue 2026-10-10 3000000', '2026-11-10..2026-12-09 due 2026-11-10 issue 2026-11-10 3000000']],
      ['room from move-in, before the period end', room, '2026-09-30', ['2026-10-01..2026-10-09 due 2026-10-01 issue 2026-10-01 900000', '2026-10-10..2026-11-09 due 2026-10-10 issue 2026-10-10 3000000', '2026-11-10..2026-12-09 due 2026-11-10 issue 2026-11-10 3000000']],
      ['room from move-in, after the period end', room, '2026-10-20', ['2026-10-21..2026-11-09 due 2026-10-21 issue 2026-10-21 1935484', '2026-11-10..2026-12-09 due 2026-11-10 issue 2026-11-10 3000000']],
    ] as const)('%s', (_, lease, paidThrough, expected) => {
      expect(spans({ ...lease, paidThroughDate: d(paidThrough) }, '2026-10-07')).toEqual(expected);
    });

    it('keeps the due offset on the remainder', () => {
      expect(spans({ ...quarterly, paidThroughDate: d('2026-09-30'), dueOffsetDays: 5 }, '2026-10-07')[0]).toBe('2026-10-01..2026-10-31 due 2026-10-06 issue 2026-10-01 10108696');
    });
  });

  it('plans the same drafts on a second run, so the unique (lease_id, period_start) insert adds nothing', () => {
    expect(planInvoices(monthly, [], d('2026-10-07'))).toEqual(planInvoices(monthly, [], d('2026-10-07')));
  });
});
