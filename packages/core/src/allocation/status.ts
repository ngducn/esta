import type { Vnd } from '../money/vnd';

export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'overpaid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** A zero-total invoice owes nothing, so it reads `paid` even with nothing allocated. */
export function derivePaymentStatus(totalVnd: Vnd, allocatedVnd: Vnd): PaymentStatus {
  if (allocatedVnd > totalVnd) return 'overpaid';
  if (allocatedVnd === totalVnd) return 'paid';
  return allocatedVnd === 0 ? 'unpaid' : 'partial';
}
