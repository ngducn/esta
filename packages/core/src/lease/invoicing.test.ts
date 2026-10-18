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

  it('plans the same drafts on a second run, so the unique (lease_id, period_start) insert adds nothing', () => {
    expect(planInvoices(monthly, [], d('2026-10-07'))).toEqual(planInvoices(monthly, [], d('2026-10-07')));
  });
});
