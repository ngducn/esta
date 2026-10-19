import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';

export const DEPOSIT_KINDS = ['received', 'applied', 'deduction', 'refunded'] as const;

export type DepositKind = (typeof DEPOSIT_KINDS)[number];

export type DepositEntry = { id: string; kind: DepositKind; amountVnd: Vnd; onDate: IsoDate };

export type DepositRow<E extends DepositEntry = DepositEntry> = E & { heldVnd: Vnd };

export type DepositLedger<E extends DepositEntry = DepositEntry> = { rows: readonly DepositRow<E>[]; heldVnd: Vnd };

export type DepositRefusal =
  | { reason: 'non_positive_amount'; entryId: string }
  | { reason: 'exceeds_held'; entryId: string; heldVnd: Vnd };

export type DepositLedgerResult<E extends DepositEntry = DepositEntry> = { ok: true; value: DepositLedger<E> } | ({ ok: false } & DepositRefusal);

const SIGN: Readonly<Record<DepositKind, 1 | -1>> = { received: 1, applied: -1, deduction: -1, refunded: -1 };

/**
 * Running held balance of one lease's deposit, in date order (entries on the same day keep their
 * given order). Applying, deducting or refunding more than is held refuses the whole ledger and
 * names the entry and the balance it met.
 */
export function deriveDepositLedger<E extends DepositEntry>(entries: readonly E[]): DepositLedgerResult<E> {
  const sorted = [...entries].sort((a, b) => (a.onDate < b.onDate ? -1 : a.onDate > b.onDate ? 1 : 0));
  const rows: DepositRow<E>[] = [];
  let held = vnd(0);
  for (const entry of sorted) {
    if (entry.amountVnd <= 0) return { ok: false, reason: 'non_positive_amount', entryId: entry.id };
    if (SIGN[entry.kind] === -1 && entry.amountVnd > held) {
      return { ok: false, reason: 'exceeds_held', entryId: entry.id, heldVnd: held };
    }
    held = vnd(held + SIGN[entry.kind] * entry.amountVnd);
    rows.push({ ...entry, heldVnd: held });
  }
  return { ok: true, value: { rows, heldVnd: held } };
}

/** What a lease's deposit allows next: what a member is offered on lease detail. */
export type DepositState = {
  readonly active: boolean;
  readonly heldVnd: Vnd;
  readonly hasEntries: boolean;
  /** Whether an issued invoice of the lease still owes something. */
  readonly owesInvoice: boolean;
};

/**
 * LSE-9: receiving while the lease runs, or on any lease with nothing recorded yet; using, deducting and refunding only
 * while something is held, and using only while an invoice of the lease still owes.
 */
export function depositActions({ active, heldVnd, hasEntries, owesInvoice }: DepositState): DepositKind[] {
  return DEPOSIT_KINDS.filter((kind) => {
    if (kind === 'received') return active || !hasEntries;
    if (kind === 'applied') return heldVnd > 0 && owesInvoice;
    return heldVnd > 0;
  });
}

/**
 * The amount a deposit sheet opens with, where the answer is usually known: the whole held balance for a refund, what
 * the invoice still owes (up to what is held) for using it on rent, and the lease's deposit for a first receipt.
 */
export function depositPrefill(kind: DepositKind, { heldVnd, hasEntries }: DepositState, contractVnd: Vnd | null, owedVnd: Vnd | null): Vnd | null {
  if (kind === 'refunded') return heldVnd;
  if (kind === 'applied') return owedVnd === null ? null : vnd(Math.min(heldVnd, owedVnd));
  if (kind === 'received' && !hasEntries && contractVnd !== null && contractVnd > 0) return contractVnd;
  return null;
}

export type DepositPreview =
  | { readonly ok: true; readonly heldVnd: Vnd }
  | { readonly ok: false; readonly reason: 'exceeds_held' | 'exceeds_outstanding'; readonly limitVnd: Vnd }
  | { readonly ok: false; readonly reason: 'non_positive_amount' };

/**
 * The held balance once `entry` joins the ledger, or why `record_deposit_entry` and `apply_deposit` would refuse it:
 * using more than the invoice owes (`owedVnd`, for an applied entry), or taking out more than is held at its date.
 */
export function previewDepositEntry(entries: readonly DepositEntry[], entry: DepositEntry, owedVnd: Vnd | null): DepositPreview {
  if (entry.kind === 'applied' && owedVnd !== null && entry.amountVnd > owedVnd) return { ok: false, reason: 'exceeds_outstanding', limitVnd: owedVnd };
  const after = deriveDepositLedger([...entries, entry]);
  if (after.ok) return { ok: true, heldVnd: after.value.heldVnd };
  return after.reason === 'exceeds_held' ? { ok: false, reason: 'exceeds_held', limitVnd: after.heldVnd } : { ok: false, reason: 'non_positive_amount' };
}
