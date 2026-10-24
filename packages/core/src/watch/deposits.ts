import { vnd, type Vnd } from '../money/vnd';

type Renewal = { readonly id: string; readonly renewalOfLeaseId: string | null };

/**
 * `renew_lease` copies the deposit amount to the new lease and writes no entries for it, so the old lease keeps the
 * held balance on its ledger. The deposit belongs to the last lease of a renewal chain, where it is settled in the end.
 */
export function carryDepositsToRenewals(leases: readonly Renewal[], held: ReadonlyMap<string, Vnd>): Map<string, Vnd> {
  const renewedBy = new Map(leases.flatMap((lease) => (lease.renewalOfLeaseId === null ? [] : [[lease.renewalOfLeaseId, lease.id] as const])));
  const carried = new Map<string, Vnd>();
  for (const [leaseId, amount] of held) {
    const seen = new Set([leaseId]);
    let last = leaseId;
    for (let next = renewedBy.get(last); next !== undefined && !seen.has(next); next = renewedBy.get(last)) {
      seen.add(next);
      last = next;
    }
    carried.set(last, vnd((carried.get(last) ?? 0) + amount));
  }
  return carried;
}
