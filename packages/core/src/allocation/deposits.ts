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
