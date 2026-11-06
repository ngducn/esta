import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { calculate, divRoundHalfAway, loanPaymentExact, type TypedValue } from './index';

const nb = (s: string) => s.replaceAll(' ₫', '\u00a0₫');
const v = (n: number): TypedValue => ({ kind: 'vnd', value: vnd(n) });
const bp = (n: number): TypedValue => ({ kind: 'bp', value: n });
const monthlyBp = (n: number): TypedValue => ({ kind: 'bp', value: n, per: 'month' });
const count = (n: number): TypedValue => ({ kind: 'count', value: n, unit: 'tháng' });
const months = (n: number): TypedValue => ({ kind: 'months', value: n });

function run(id: string, operands: TypedValue[]) {
  const out = calculate(id, operands);
  if (!out.ok) throw new Error(JSON.stringify(out.reason));
  return out.value;
}

describe('operations', () => {
  it('sum adds any number of amounts', () => {
    const out = run('sum', [v(1_000_000), v(2_500_000), v(500_000)]);
    expect(out.value).toEqual(v(4_000_000));
    expect(out.working_display).toBe(nb('1.000.000 ₫ + 2.500.000 ₫ + 500.000 ₫ = 4.000.000 ₫'));
  });
  it('difference gives 4.000.000 − 3.200.000 = 800.000', () => {
    expect(run('difference', [v(4_000_000), v(3_200_000)]).value).toEqual(v(800_000));
    expect(run('difference', [v(1), v(3)]).value).toEqual(v(-2));
  });
  it('times_count gives 3.500.000 × 12 = 42.000.000', () => {
    const out = run('times_count', [v(3_500_000), { kind: 'count', value: 12, unit: 'tháng' }]);
    expect(out.value).toEqual(v(42_000_000));
    expect(out.working_display).toBe(nb('3.500.000 ₫ × 12 = 42.000.000 ₫'));
  });
  it('monthly_to_yearly shows 4.000.000 ₫ × 12 = 48.000.000 ₫', () => {
    expect(run('monthly_to_yearly', [v(4_000_000)]).working_display).toBe(nb('4.000.000 ₫ × 12 = 48.000.000 ₫'));
  });
  it('yearly_to_monthly rounds half up: 6 ÷ 12 = 0.5 → 1, 5 ÷ 12 = 0.4167 → 0', () => {
    expect(run('yearly_to_monthly', [v(6)]).value).toEqual(v(1));
    expect(run('yearly_to_monthly', [v(5)]).value).toEqual(v(0));
    expect(run('yearly_to_monthly', [v(48_000_000)]).value).toEqual(v(4_000_000));
  });
  it('share_bp: 3.000.000 of 12.000.000 is 2500 bp; 1 of 8 is 1250 bp; 1 of 3 rounds 3333.33 down', () => {
    expect(run('share_bp', [v(3_000_000), v(12_000_000)]).value).toEqual(bp(2500));
    expect(run('share_bp', [v(1), v(8)]).value).toEqual(bp(1250));
    expect(run('share_bp', [v(1), v(3)]).value).toEqual(bp(3333));
    expect(run('share_bp', [v(2), v(3)]).value).toEqual(bp(6667));
  });
  it('share_bp refuses a zero whole', () => {
    expect(calculate('share_bp', [v(1), v(0)])).toEqual({ ok: false, reason: { kind: 'invalid', why: 'whole must be above zero' } });
  });
  it('apply_bp: 10.000.000 × 7,5% = 750.000 and 0.5 đồng rounds up', () => {
    expect(run('apply_bp', [v(10_000_000), bp(750)]).value).toEqual(v(750_000));
    expect(run('apply_bp', [v(1), bp(5000)]).value).toEqual(v(1));
    expect(run('apply_bp', [v(1), bp(4999)]).value).toEqual(v(0));
  });
  it('change_bp: 1,2 tỷ to 1,5 tỷ is +25%; a fall is negative', () => {
    expect(run('change_bp', [v(1_200_000_000), v(1_500_000_000)]).value).toEqual(bp(2500));
    expect(run('change_bp', [v(1_500_000_000), v(1_200_000_000)]).value).toEqual(bp(-2000));
    expect(run('change_bp', [v(3), v(4)]).value).toEqual(bp(3333));
  });
  it('change_bp refuses a start of zero', () => {
    expect(calculate('change_bp', [v(0), v(5)]).ok).toBe(false);
  });
  it('days_between counts days across a leap year', () => {
    const d = (s: string): TypedValue => ({ kind: 'date', value: isoDate(s) });
    expect(run('days_between', [d('2026-10-07'), d('2026-10-20')]).value).toEqual({ kind: 'count', value: 13, unit: 'ngày' });
    expect(run('days_between', [d('2024-02-28'), d('2024-03-01')]).value).toMatchObject({ value: 2 });
    expect(run('days_between', [d('2026-10-20'), d('2026-10-07')]).value).toMatchObject({ value: -13 });
  });
});

describe('loan_payment, pinned to an independent rational reference', () => {
  const cases: Array<[string, number, number, number, number]> = [
    ['2 tỷ, 9%/năm, 180 tháng: i = 900/120000 = 0,0075, P·i/(1−1,0075^−180) = 20.285.331,68', 2_000_000_000, 900, 180, 20_285_332],
    ['1 tỷ, 12%/năm, 12 tháng: i = 0,01, P·i/(1−1,01^−12) = 88.848.788,68', 1_000_000_000, 1200, 12, 88_848_789],
    ['3 trăm triệu, 7,5%/năm, 240 tháng: 2.416.779,58', 300_000_000, 750, 240, 2_416_780],
    ['1,2 tỷ, 10,5%/năm, 120 tháng: 16.192.199,61', 1_200_000_000, 1050, 120, 16_192_200],
    ['0% rate: 500.000.000 ÷ 10 = 50.000.000', 500_000_000, 0, 10, 50_000_000],
  ];
  it.each(cases)('%s', (_name, principal, rate, n, expected) => {
    expect(run('loan_payment', [v(principal), bp(rate), months(n)]).value).toEqual(v(expected));
  });
  it('names all three inputs in its working', () => {
    expect(run('loan_payment', [v(2_000_000_000), bp(900), months(180)]).working_display).toBe(
      nb('2.000.000.000 ₫, 9%/năm, 180 tháng → 20.285.332 ₫/tháng'),
    );
  });
  it('refuses zero or too many months', () => {
    expect(calculate('loan_payment', [v(1_000_000), bp(900), months(0)]).ok).toBe(false);
    expect(calculate('loan_payment', [v(1_000_000), bp(900), months(1201)]).ok).toBe(false);
  });
  it('exact helper agrees at a long term', () => {
    expect(loanPaymentExact(1_000_000_000n, 900n, 360n)).toBe(8_046_226n);
  });
});

describe('refusals', () => {
  it('names the operand of the wrong kind', () => {
    expect(calculate('monthly_to_yearly', [bp(900)])).toEqual({ ok: false, reason: { kind: 'wrong_kind', index: 0, expected: 'vnd', got: 'bp' } });
    expect(calculate('loan_payment', [v(1), bp(1), count(3)])).toEqual({
      ok: false,
      reason: { kind: 'wrong_kind', index: 2, expected: 'months', got: 'count' },
    });
  });
  it('refuses the wrong number of operands and an unknown operation', () => {
    expect(calculate('difference', [v(1)])).toEqual({ ok: false, reason: { kind: 'arity', expected: 2, got: 1 } });
    expect(calculate('sum', [v(1)]).ok).toBe(false);
    expect(calculate('nope', [])).toEqual({ ok: false, reason: { kind: 'unknown_op' } });
  });
  it('refuses a result above Number.MAX_SAFE_INTEGER', () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(calculate('sum', [v(big), v(1)])).toEqual({ ok: false, reason: { kind: 'overflow' } });
    expect(calculate('monthly_to_yearly', [v(big)])).toEqual({ ok: false, reason: { kind: 'overflow' } });
  });
});

describe('divRoundHalfAway', () => {
  it('rounds .5 away from zero and exact quotients stay', () => {
    expect(divRoundHalfAway(1n, 2n)).toBe(1n);
    expect(divRoundHalfAway(3n, 2n)).toBe(2n);
    expect(divRoundHalfAway(-1n, 2n)).toBe(-1n);
    expect(divRoundHalfAway(-3n, 2n)).toBe(-2n);
    expect(divRoundHalfAway(-4n, 3n)).toBe(-1n);
    expect(divRoundHalfAway(10n, 5n)).toBe(2n);
  });
});

describe('fix round 1', () => {
  it('B5 refuses a basis-point result above Number.MAX_SAFE_INTEGER', () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(calculate('share_bp', [v(big), v(1)])).toEqual({ ok: false, reason: { kind: 'overflow' } });
    expect(calculate('change_bp', [v(1), v(big)])).toEqual({ ok: false, reason: { kind: 'overflow' } });
  });
  it('rounds a negative half away from zero, like Postgres round()', () => {
    expect(run('yearly_to_monthly', [v(-6)]).value).toEqual(v(-1));
    expect(run('yearly_to_monthly', [v(-5)]).value).toEqual(v(0));
    expect(run('change_bp', [v(20_000), v(19_999)]).value).toEqual(bp(-1));
  });
  it('refuses a negative loan rate with a reason', () => {
    expect(calculate('loan_payment', [v(1_000_000), bp(-1200), months(12)])).toEqual({
      ok: false,
      reason: { kind: 'invalid', why: 'rate must not be negative' },
    });
  });
  it('refuses a non-integer operand instead of throwing', () => {
    const odd = { ok: false, reason: { kind: 'invalid', why: 'operand must be a whole number' } };
    expect(calculate('loan_payment', [v(1_000_000), bp(900), months(12.5)])).toEqual(odd);
    expect(calculate('apply_bp', [v(1_000_000), bp(Number.NaN)])).toEqual(odd);
    expect(calculate('times_count', [v(1_000_000), count(1.5)])).toEqual(odd);
  });
  it('writes English units in the singular for one', () => {
    const day = (a: string, b: string) => calculate('days_between', [{ kind: 'date', value: isoDate(a) }, { kind: 'date', value: isoDate(b) }], 'en');
    const one = day('2026-10-07', '2026-10-08');
    expect(one.ok && one.value.result_display).toBe('1 day');
    const two = day('2026-10-07', '2026-10-09');
    expect(two.ok && two.value.result_display).toBe('2 days');
    const loan = calculate('loan_payment', [v(1_000_000), bp(900), months(1)], 'en');
    expect(loan.ok && loan.value.working_display).toContain('1 month →');
  });
});

describe('monthly_rate_to_yearly: a monthly rate times twelve, as its own step before the loan', () => {
  it('turns 0,8%/tháng into 9,6%/năm and shows the step', () => {
    const out = run('monthly_rate_to_yearly', [monthlyBp(80)]);
    expect(out.value).toEqual(bp(960));
    expect(out.working_display).toBe('0,8%/tháng × 12 = 9,6%/năm');
  });
  it('feeds loan_payment to 21.005.345 ₫ for 2 tỷ over 180 tháng, the exact annuity at 0,8% a month', () => {
    expect(run('loan_payment', [v(2_000_000_000), bp(960), months(180)]).value).toEqual(v(21_005_345));
  });
  it('refuses a rate that is not monthly, and a monthly rate as a loan rate', () => {
    expect(calculate('monthly_rate_to_yearly', [bp(80)]).ok).toBe(false);
    expect(calculate('loan_payment', [v(2_000_000_000), monthlyBp(80), months(180)]).ok).toBe(false);
  });
  it('refuses a monthly rate whose yearly value passes a safe integer, and a negative monthly rate', () => {
    expect(calculate('monthly_rate_to_yearly', [monthlyBp(Math.floor(Number.MAX_SAFE_INTEGER / 12) + 1)])).toEqual({ ok: false, reason: { kind: 'overflow' } });
    expect(calculate('monthly_rate_to_yearly', [monthlyBp(-80)])).toEqual({ ok: false, reason: { kind: 'invalid', why: 'rate must not be negative' } });
  });
});
