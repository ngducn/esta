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
  it('yearly_to_monthly rounds an exact half away from zero, at either sign', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000_000_000, max: 100_000_000_000 }), (k) => {
        // 12k + 6 over 12 is k + 0.5: k + 1 above zero, k below it.
        expect(amountOf('yearly_to_monthly', [v(12 * k + 6)])).toBe(k >= 0 ? k + 1 : k);
      }),
    );
  });
  it('loan_payment equals the half-up rational reference, edges included', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000_000_000 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 1200 }),
        (principal, rate, n) => {
          const P = BigInt(principal);
          const N = BigInt(n);
          let num: bigint;
          let den: bigint;
          if (rate === 0) {
            num = P;
            den = N;
          } else {
            const g = (120_000n + BigInt(rate)) ** N;
            const f = 120_000n ** N;
            num = P * BigInt(rate) * g;
            den = 120_000n * (g - f);
          }
          const want = (2n * num + den) / (2n * den);
          const paid = amountOf('loan_payment', [v(principal), { kind: 'bp', value: rate }, { kind: 'months', value: n }]);
          expect(BigInt(paid)).toBe(want);
        },
      ),
      { numRuns: 200 },
    );
  });
});
