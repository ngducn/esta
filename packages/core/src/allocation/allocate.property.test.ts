import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isoDate, type IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { allocatePayment, type Allocation, type AllocationPlan, type OpenInvoice } from './allocate';
import { DEPOSIT_KINDS, deriveDepositLedger, type DepositEntry, type DepositKind } from './deposits';
import { derivePaymentStatus } from './status';

const params = { seed: 20261007, numRuns: 1000 };

const day = fc.constantFrom(...['2026-07-25', '2026-08-25', '2026-09-25', '2026-10-25'].map(isoDate));
const amount = (max: number) => fc.integer({ min: 1, max }).map(vnd);

const invoices: fc.Arbitrary<OpenInvoice[]> = fc.uniqueArray(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 4 }),
    dueDate: day,
    periodStart: day,
    outstandingVnd: fc.oneof(fc.constant(vnd(0)), amount(20_000_000_000)),
  }),
  { maxLength: 12, selector: (invoice) => invoice.id },
);

const payment = amount(100_000_000_000);

function plan(amountVnd: Vnd, open: readonly OpenInvoice[], override?: readonly Allocation[]): AllocationPlan {
  const result = allocatePayment(amountVnd, open, override);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

const sum = (allocations: readonly Allocation[]) => allocations.reduce((total, a) => total + a.amountVnd, 0);
const key = (invoice: OpenInvoice): [IsoDate, IsoDate, string] => [invoice.dueDate, invoice.periodStart, invoice.id];
const older = (a: OpenInvoice, b: OpenInvoice) => key(a).join('|') < key(b).join('|');

describe('allocatePayment, oldest due first (LSE-7)', () => {
  it('allocates only positive amounts, never more than the payment, and leaves no negative credit', () => {
    fc.assert(
      fc.property(payment, invoices, (paid, open) => {
        const { allocations, creditVnd } = plan(paid, open);
        expect(allocations.every((a) => Number.isSafeInteger(a.amountVnd) && a.amountVnd > 0)).toBe(true);
        expect(creditVnd).toBeGreaterThanOrEqual(0);
        expect(sum(allocations) + creditVnd).toBe(paid);
      }),
      params,
    );
  });

  it('allocates min(payment, open total) and keeps the rest as credit', () => {
    fc.assert(
      fc.property(payment, invoices, (paid, open) => {
        const openTotal = open.reduce((total, invoice) => total + invoice.outstandingVnd, 0);
        const { allocations, creditVnd } = plan(paid, open);
        expect(sum(allocations)).toBe(Math.min(paid, openTotal));
        expect(creditVnd).toBe(Math.max(0, paid - openTotal));
      }),
      params,
    );
  });

  it('never gives an invoice more than its outstanding amount, and names each invoice at most once', () => {
    fc.assert(
      fc.property(payment, invoices, (paid, open) => {
        const outstanding = new Map(open.map((invoice) => [invoice.id, invoice.outstandingVnd]));
        const { allocations } = plan(paid, open);
        expect(new Set(allocations.map((a) => a.invoiceId)).size).toBe(allocations.length);
        for (const a of allocations) expect(a.amountVnd).toBeLessThanOrEqual(outstanding.get(a.invoiceId) ?? -1);
      }),
      params,
    );
  });

  it('pays a later invoice only when every older one is paid in full', () => {
    fc.assert(
      fc.property(payment, invoices, (paid, open) => {
        const given = new Map(plan(paid, open).allocations.map((a) => [a.invoiceId, a.amountVnd]));
        for (const later of open) {
          if (!given.has(later.id)) continue;
          for (const earlier of open.filter((invoice) => older(invoice, later))) {
            expect(given.get(earlier.id) ?? 0).toBe(earlier.outstandingVnd);
          }
        }
      }),
      params,
    );
  });

  it('gives the same plan whatever order the invoices arrive in', () => {
    fc.assert(
      fc.property(payment, invoices.chain((open) => fc.tuple(fc.constant(open), fc.shuffledSubarray(open, { minLength: open.length }))), (paid, [open, shuffled]) => {
        expect(plan(paid, shuffled)).toEqual(plan(paid, open));
      }),
      params,
    );
  });

  it('never leaves an allocated invoice overpaid', () => {
    fc.assert(
      fc.property(payment, invoices, (paid, open) => {
        const given = new Map(plan(paid, open).allocations.map((a) => [a.invoiceId, a.amountVnd]));
        for (const invoice of open) {
          const status = derivePaymentStatus(invoice.outstandingVnd, given.get(invoice.id) ?? vnd(0));
          expect(status).not.toBe('overpaid');
        }
      }),
      params,
    );
  });
});

const withOverride = invoices
  .filter((open) => open.length > 0)
  .chain((open) =>
    fc.tuple(
      fc.constant(open),
      fc.uniqueArray(
        fc.record({ invoiceId: fc.constantFrom(...open.map((invoice) => invoice.id)), amountVnd: amount(20_000_000_000) }),
        { minLength: 1, maxLength: open.length, selector: (a) => a.invoiceId },
      ),
    ),
  );

describe('allocatePayment with an override', () => {
  it('follows the override exactly and keeps the unnamed rest as credit when it fits the payment', () => {
    fc.assert(
      fc.property(payment, withOverride, (paid, [open, override]) => {
        const result = allocatePayment(paid, open, override);
        if (sum(override) > paid) {
          expect(result).toEqual({ ok: false, reason: 'override_exceeds_payment' });
          return;
        }
        expect(result).toEqual({ ok: true, value: { allocations: override, creditVnd: paid - sum(override) } });
      }),
      params,
    );
  });
});

const ledger: fc.Arbitrary<DepositEntry[]> = fc.array(
  fc.record({ kind: fc.constantFrom(...DEPOSIT_KINDS), amountVnd: amount(50_000_000), onDate: day }),
  { maxLength: 15 },
).map((entries) => entries.map((entry, i) => ({ id: `e${i}`, ...entry })));

describe('deriveDepositLedger', () => {
  it('never holds a negative balance and refuses exactly the first entry that would take it below zero', () => {
    fc.assert(
      fc.property(ledger, (entries) => {
        const result = deriveDepositLedger(entries);
        const ordered = [...entries].sort((a, b) => (a.onDate < b.onDate ? -1 : a.onDate > b.onDate ? 1 : 0));
        let held = 0;
        for (const entry of ordered) {
          const next = held + (entry.kind === 'received' ? entry.amountVnd : -entry.amountVnd);
          if (next < 0) {
            expect(result).toEqual({ ok: false, reason: 'exceeds_held', entryId: entry.id, heldVnd: held });
            return;
          }
          held = next;
        }
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.heldVnd).toBe(held);
        expect(result.value.rows.every((row) => row.heldVnd >= 0)).toBe(true);
        expect(result.value.rows.map((row) => row.id)).toEqual(ordered.map((entry) => entry.id));
      }),
      params,
    );
  });

  it('holds what was received less what was applied, deducted and refunded', () => {
    fc.assert(
      fc.property(ledger, (entries) => {
        const result = deriveDepositLedger(entries);
        if (!result.ok) return;
        const total = (kind: DepositKind) => entries.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.amountVnd, 0);
        expect(result.value.heldVnd).toBe(total('received') - total('applied') - total('deduction') - total('refunded'));
      }),
      params,
    );
  });
});
