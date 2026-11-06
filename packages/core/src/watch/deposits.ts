import { vnd, type Vnd } from '../money/vnd';

type Renewal = { readonly id: string; readonly renewalOfLeaseId: string | null };

/** Which lease renewed each lease: the one place that reads `renewalOfLeaseId`, for the deposit chain and for the watch's `renewed` flag. */
export function renewedBy(leases: readonly Renewal[]): Map<string, string> {
  return new Map(leases.flatMap((lease) => (lease.renewalOfLeaseId === null ? [] : [[lease.renewalOfLeaseId, lease.id] as const])));
}

/**
 * `renew_lease` copies the deposit amount to the new lease and writes no entries for it, so the old lease keeps the
 * held balance on its ledger. The deposit belongs to the last lease of a renewal chain, where it is settled in the end.
 */
export function carryDepositsToRenewals(leases: readonly Renewal[], held: ReadonlyMap<string, Vnd>): Map<string, Vnd> {
  const renewals = renewedBy(leases);
  const carried = new Map<string, Vnd>();
  for (const [leaseId, amount] of held) {
    const seen = new Set([leaseId]);
    let last = leaseId;
    for (let next = renewals.get(last); next !== undefined && !seen.has(next); next = renewals.get(last)) {
      seen.add(next);
      last = next;
    }
    carried.set(last, vnd((carried.get(last) ?? 0) + amount));
  }
  return carried;
}
