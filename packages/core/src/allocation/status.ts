import type { Vnd } from '../money/vnd';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'overpaid';

/** A zero-total invoice owes nothing, so it reads `paid` even with nothing allocated. */
export function derivePaymentStatus(totalVnd: Vnd, allocatedVnd: Vnd): PaymentStatus {
  if (allocatedVnd > totalVnd) return 'overpaid';
  if (allocatedVnd === totalVnd) return 'paid';
  return allocatedVnd === 0 ? 'unpaid' : 'partial';
}
