import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import type { Result } from '../result';

export type OpenInvoice = {
  id: string;
  dueDate: IsoDate;
  periodStart: IsoDate;
  outstandingVnd: Vnd;
};

export type Allocation = { invoiceId: string; amountVnd: Vnd };

export type AllocationPlan = { allocations: readonly Allocation[]; creditVnd: Vnd };

export type AllocationRefusal =
  | 'non_positive_payment'
  | 'override_non_positive'
  | 'override_unknown_invoice'
  | 'override_duplicate_invoice'
  | 'override_exceeds_payment';

function oldestFirst(a: OpenInvoice, b: OpenInvoice): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.periodStart !== b.periodStart) return a.periodStart < b.periodStart ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function checkOverride(
  amountVnd: Vnd,
  openInvoices: readonly OpenInvoice[],
  override: readonly Allocation[],
): AllocationRefusal | undefined {
  const open = new Set(openInvoices.map((invoice) => invoice.id));
  const named = new Set<string>();
  let total = 0;
  for (const { invoiceId, amountVnd: part } of override) {
    if (part <= 0) return 'override_non_positive';
    if (!open.has(invoiceId)) return 'override_unknown_invoice';
    if (named.has(invoiceId)) return 'override_duplicate_invoice';
    named.add(invoiceId);
    total += part;
  }
  return total > amountVnd ? 'override_exceeds_payment' : undefined;
}

/**
 * Splits a payment over a tenant's open invoices, oldest due date first, and returns what is left
 * as credit. An override names every allocation itself: it may skip an older invoice or pay one
 * past its outstanding amount, and whatever it leaves unnamed is credit, not spread oldest first.
 */
export function allocatePayment(
  amountVnd: Vnd,
  openInvoices: readonly OpenInvoice[],
  override?: readonly Allocation[],
): Result<AllocationPlan, AllocationRefusal> {
  if (amountVnd <= 0) return { ok: false, reason: 'non_positive_payment' };
  let allocations: Allocation[];
  if (override === undefined) {
    allocations = [];
    let left: number = amountVnd;
    for (const invoice of [...openInvoices].sort(oldestFirst)) {
      if (left === 0) break;
      const part = Math.min(left, invoice.outstandingVnd);
      if (part <= 0) continue;
      allocations.push({ invoiceId: invoice.id, amountVnd: vnd(part) });
      left -= part;
    }
  } else {
    const refusal = checkOverride(amountVnd, openInvoices, override);
    if (refusal !== undefined) return { ok: false, reason: refusal };
    allocations = [...override];
  }
  const allocated = allocations.reduce((sum, { amountVnd: part }) => sum + part, 0);
  return { ok: true, value: { allocations, creditVnd: vnd(amountVnd - allocated) } };
}
