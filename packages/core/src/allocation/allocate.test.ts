import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { allocatePayment, owedThrough, type Allocation, type OpenInvoice } from './allocate';

const d = isoDate;

function invoice(id: string, dueDate: string, outstanding: number, periodStart = dueDate): OpenInvoice {
  return { id, dueDate: d(dueDate), periodStart: d(periodStart), outstandingVnd: vnd(outstanding) };
}

const august = invoice('aug', '2026-08-25', 3_500_000);
const september = invoice('sep', '2026-09-25', 3_500_000);
const october = invoice('oct', '2026-10-25', 3_500_000);

function plan(amount: number, open: readonly OpenInvoice[], override?: readonly Allocation[]) {
  const result = allocatePayment(vnd(amount), open, override);
  if (!result.ok) throw new Error(result.reason);
  return { allocations: result.value.allocations.map((a) => [a.invoiceId, a.amountVnd]), creditVnd: result.value.creditVnd };
}

function part(invoiceId: string, amount: number): Allocation {
  return { invoiceId, amountVnd: vnd(amount) };
}

describe('allocatePayment', () => {
  it('pays one invoice exactly and leaves no credit', () => {
    expect(plan(3_500_000, [september])).toEqual({ allocations: [['sep', 3_500_000]], creditVnd: 0 });
  });

  it('pays part of the oldest invoice when the payment is short', () => {
    expect(plan(2_000_000, [october, september])).toEqual({ allocations: [['sep', 2_000_000]], creditVnd: 0 });
  });

  it('fills the oldest invoice first, then the next, for 5,000,000 against 3,500,000 and 3,500,000', () => {
    expect(plan(5_000_000, [october, september])).toEqual({
      allocations: [
        ['sep', 3_500_000],
        ['oct', 1_500_000],
      ],
      creditVnd: 0,
    });
  });

  it('turns what is left after every open invoice into credit', () => {
    expect(plan(4_000_000, [september])).toEqual({ allocations: [['sep', 3_500_000]], creditVnd: 500_000 });
    expect(plan(1_000_000, [])).toEqual({ allocations: [], creditVnd: 1_000_000 });
  });

  it('settles one invoice with two partial transfers that sum to its total', () => {
    expect(plan(2_000_000, [september])).toEqual({ allocations: [['sep', 2_000_000]], creditVnd: 0 });
    const rest = { ...september, outstandingVnd: vnd(1_500_000) };
    expect(plan(1_500_000, [rest])).toEqual({ allocations: [['sep', 1_500_000]], creditVnd: 0 });
  });

  it('breaks a due-date tie by the older period start, then by invoice id', () => {
    const rent = invoice('rent', '2026-09-25', 1_000_000, '2026-09-25');
    const backdated = invoice('backdated', '2026-09-25', 1_000_000, '2026-08-25');
    expect(plan(1_000_000, [rent, backdated]).allocations).toEqual([['backdated', 1_000_000]]);
    const b = invoice('b', '2026-09-25', 1_000_000);
    const a = invoice('a', '2026-09-25', 1_000_000);
    expect(plan(1_000_000, [b, a]).allocations).toEqual([['a', 1_000_000]]);
  });

  it('skips invoices with nothing outstanding', () => {
    const settled = invoice('settled', '2026-07-25', 0);
    expect(plan(1_000_000, [settled, september])).toEqual({ allocations: [['sep', 1_000_000]], creditVnd: 0 });
  });

  it('follows a manual override that skips the oldest invoice', () => {
    expect(plan(3_500_000, [august, september], [part('sep', 3_500_000)])).toEqual({
      allocations: [['sep', 3_500_000]],
      creditVnd: 0,
    });
  });

  it('keeps what an override leaves unnamed as credit instead of spreading it', () => {
    expect(plan(5_000_000, [august, september], [part('sep', 3_500_000)])).toEqual({
      allocations: [['sep', 3_500_000]],
      creditVnd: 1_500_000,
    });
  });

  it('lets an override pay an invoice past its outstanding amount', () => {
    expect(plan(4_000_000, [september], [part('sep', 4_000_000)])).toEqual({ allocations: [['sep', 4_000_000]], creditVnd: 0 });
  });

  it('refuses an override above the payment amount', () => {
    expect(allocatePayment(vnd(3_500_000), [august, september], [part('aug', 3_500_000), part('sep', 1)])).toEqual({
      ok: false,
      reason: 'override_exceeds_payment',
    });
  });

  it.each([
    ['a non-positive part', [part('sep', 0)], 'override_non_positive'],
    ['an invoice that is not open', [part('nov', 1_000)], 'override_unknown_invoice'],
    ['the same invoice twice', [part('sep', 1_000), part('sep', 1_000)], 'override_duplicate_invoice'],
  ] as const)('refuses an override with %s', (_, override, reason) => {
    expect(allocatePayment(vnd(3_500_000), [september], override)).toEqual({ ok: false, reason });
  });

  it.each([0, -1])('refuses a payment of %i', (amount) => {
    expect(allocatePayment(vnd(amount), [september])).toEqual({ ok: false, reason: 'non_positive_payment' });
  });
});

describe('owedThrough', () => {
  it('asks for the row and every older open invoice of the lease, never a later one', () => {
    expect(owedThrough([october, august, september], 'sep')).toBe(7_000_000);
    expect(owedThrough([october, august, september], 'aug')).toBe(3_500_000);
    expect(owedThrough([october, august, september], 'oct')).toBe(10_500_000);
  });

  it('asks for nothing when the row is no longer open', () => {
    expect(owedThrough([august, september], 'oct')).toBe(0);
  });
});
