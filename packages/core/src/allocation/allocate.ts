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

/** The issued invoices that still owe, in the order `record_payment` and `apply_deposit` take them: oldest due first. */
export function openInvoicesOldestFirst<I extends OpenInvoice & { readonly status: string }>(invoices: readonly I[]): I[] {
  return invoices.filter((invoice) => invoice.status === 'issued' && invoice.outstandingVnd > 0).sort(oldestFirst);
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

/**
 * What a collections row asks for when Mẹ records a payment from it: that invoice and every open invoice of the same
 * lease due before it, in the order allocatePayment would settle them. Zero when the invoice is not among them.
 */
export function owedThrough(openInvoices: readonly OpenInvoice[], invoiceId: string): Vnd {
  const ordered = [...openInvoices].sort(oldestFirst);
  const end = ordered.findIndex((invoice) => invoice.id === invoiceId);
  if (end < 0) return vnd(0);
  return vnd(ordered.slice(0, end + 1).reduce((sum, invoice) => sum + invoice.outstandingVnd, 0));
}

/**
 * What a payment sheet saw owed when it opened: owedThrough its row, or the total of the invoices Mẹ chose.
 * `record_payment` refuses the payment when the database no longer agrees, because the sheet's amount and allocation
 * were worked out from those numbers.
 */
export function owedFor(openInvoices: readonly OpenInvoice[], invoiceId: string, chosen: readonly string[] | null): Vnd {
  if (chosen === null) return owedThrough(openInvoices, invoiceId);
  return vnd(openInvoices.filter((invoice) => chosen.includes(invoice.id)).reduce((sum, invoice) => sum + invoice.outstandingVnd, 0));
}
