import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { vnd } from '../money/vnd';
import { calculate, type TypedValue } from './index';

const v = (n: number): TypedValue => ({ kind: 'vnd', value: vnd(n) });
const money = fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 });

function amountOf(id: string, operands: TypedValue[]): number {
  const out = calculate(id, operands);
  if (!out.ok || out.value.value.kind !== 'vnd') throw new Error('expected vnd');
  return out.value.value.value;
}

describe('calc properties', () => {
  it('difference undoes sum', () => {
    fc.assert(
      fc.property(money, money, (a, b) => {
        const total = amountOf('sum', [v(a), v(b)]);
        expect(amountOf('difference', [v(total), v(b)])).toBe(a);
      }),
    );
  });
  it('monthly_to_yearly then yearly_to_monthly returns the input', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80_000_000_000 }), (m) => {
        expect(amountOf('yearly_to_monthly', [v(amountOf('monthly_to_yearly', [v(m)]))])).toBe(m);
      }),
    );
  });
  it('loan_payment is within 1 đồng of an exact rational reference', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000_000, max: 50_000_000_000 }),
        fc.integer({ min: 1, max: 3000 }),
        fc.integer({ min: 1, max: 360 }),
        (principal, rate, n) => {
          const paid = amountOf('loan_payment', [v(principal), { kind: 'bp', value: rate }, { kind: 'months', value: n }]);
          const base = 120_000n;
          const growth = (base + BigInt(rate)) ** BigInt(n);
          const flat = base ** BigInt(n);
          const numerator = BigInt(principal) * BigInt(rate) * growth;
          const denominator = base * (growth - flat);
          const floor = numerator / denominator;
          expect(BigInt(paid) === floor || BigInt(paid) === floor + 1n).toBe(true);
        },
      ),
    );
  });
});
