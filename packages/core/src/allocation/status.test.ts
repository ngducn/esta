import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { derivePaymentStatus, type PaymentStatus } from './status';

const CASES: readonly (readonly [string, number, number, PaymentStatus])[] = [
  ['nothing allocated', 3_500_000, 0, 'unpaid'],
  ['one dong allocated', 3_500_000, 1, 'partial'],
  ['first of two transfers', 3_500_000, 2_000_000, 'partial'],
  ['one dong short', 3_500_000, 3_499_999, 'partial'],
  ['exact total', 3_500_000, 3_500_000, 'paid'],
  ['two transfers summing to the total', 3_500_000, 2_000_000 + 1_500_000, 'paid'],
  ['one dong over', 3_500_000, 3_500_001, 'overpaid'],
  ['override past the total', 3_500_000, 4_000_000, 'overpaid'],
  ['zero total with nothing allocated', 0, 0, 'paid'],
  ['zero total with one dong allocated', 0, 1, 'overpaid'],
  ['largest safe total exactly', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'paid'],
  ['largest safe total one dong short', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, 'partial'],
];

function csv(): string {
  const rows = CASES.map(([name, total, allocated, status]) => `${name},${total},${allocated},${status}`);
  return `case,total_vnd,allocated_vnd,payment_status\n${rows.join('\n')}\n`;
}

describe('derivePaymentStatus', () => {
  it.each(CASES)('%s: total %i, allocated %i is %s', (_, total, allocated, status) => {
    expect(derivePaymentStatus(vnd(total), vnd(allocated))).toBe(status);
  });

  it('exports every case as the expected rows for the invoice_balances parity test', async () => {
    await expect(csv()).toMatchFileSnapshot('../../../../supabase/tests/fixtures/payment_status.csv');
  });
});
