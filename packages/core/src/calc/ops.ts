import { daysBetween } from '../date/calendar';
import type { Locale } from '../format';
import { formatCount } from '../format';
import { vnd } from '../money/vnd';
import type { Result } from '../result';
import { displayTyped } from './display';
import type { CalcOp, CalcRefusal, TypedValue } from './types';

type Step = ReturnType<CalcOp['run']>;

const BP = 10_000n;
const MAX_LOAN_MONTHS = 1200;

/**
 * `[app rule]` Exact quotient rounded half away from zero, so 0.5 đồng goes to 1 and -0.5 to -1.
 * packages/core has no money rounding helper that handles a negative, and this matches Postgres `round()` on numeric.
 * The denominator is positive.
 */
export function divRoundHalfAway(numerator: bigint, denominator: bigint): bigint {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = (2n * magnitude + denominator) / (2n * denominator);
  return numerator < 0n ? -quotient : quotient;
}

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function withinSafe(value: bigint): boolean {
  return value <= SAFE && value >= -SAFE;
}

function toVnd(value: bigint): Result<TypedValue, CalcRefusal> {
  if (!withinSafe(value)) return { ok: false, reason: { kind: 'overflow' } };
  return { ok: true, value: { kind: 'vnd', value: vnd(Number(value)) } };
}

function toBp(value: bigint): Result<TypedValue, CalcRefusal> {
  if (!withinSafe(value)) return { ok: false, reason: { kind: 'overflow' } };
  return { ok: true, value: { kind: 'bp', value: Number(value) } };
}

function vndStep(value: bigint, working: (result: string) => string, locale: Locale): Step {
  const made = toVnd(value);
  if (!made.ok) return made;
  return { ok: true, value: { value: made.value, working: working(displayTyped(made.value, locale)) } };
}

function invalid(why: string): Step {
  return { ok: false, reason: { kind: 'invalid', why } };
}

const amount = (v: TypedValue | undefined): bigint => BigInt(v?.kind === 'vnd' ? v.value : 0);
const bpOf = (v: TypedValue | undefined): bigint => BigInt(v?.kind === 'bp' ? v.value : 0);
const numberOf = (v: TypedValue | undefined): bigint => BigInt(v !== undefined && 'value' in v && typeof v.value === 'number' ? v.value : 0);

const shown = (v: TypedValue | undefined, locale: Locale): string => (v === undefined ? '' : displayTyped(v, locale));

/** monthly payment of an annuity loan: P·i·(1+i)^n / ((1+i)^n − 1) with i = bp / 120000, in exact integers. */
export function loanPaymentExact(principal: bigint, annualBp: bigint, months: bigint): bigint {
  if (annualBp === 0n) return divRoundHalfAway(principal, months);
  const base = 120_000n;
  const growth = (base + annualBp) ** months;
  const flat = base ** months;
  return divRoundHalfAway(principal * annualBp * growth, base * (growth - flat));
}

type Runner = CalcOp['run'];

const sum: Runner = (operands, locale) => {
  const total = operands.reduce((acc, v) => acc + amount(v), 0n);
  return vndStep(total, (r) => `${operands.map((v) => shown(v, locale)).join(' + ')} = ${r}`, locale);
};

const difference: Runner = ([a, b], locale) =>
  vndStep(amount(a) - amount(b), (r) => `${shown(a, locale)} − ${shown(b, locale)} = ${r}`, locale);

const timesCount: Runner = ([a, n], locale) =>
  vndStep(amount(a) * numberOf(n), (r) => `${shown(a, locale)} × ${formatCount(Number(numberOf(n)), locale)} = ${r}`, locale);

const monthlyToYearly: Runner = ([a], locale) =>
  vndStep(amount(a) * 12n, (r) => `${shown(a, locale)} × 12 = ${r}`, locale);

const yearlyToMonthly: Runner = ([a], locale) =>
  vndStep(divRoundHalfAway(amount(a), 12n), (r) => `${shown(a, locale)} ÷ 12 = ${r}`, locale);

const shareBp: Runner = ([part, whole], locale) => {
  if (amount(whole) <= 0n) return invalid('whole must be above zero');
  const made = toBp(divRoundHalfAway(amount(part) * BP, amount(whole)));
  if (!made.ok) return made;
  return { ok: true, value: { value: made.value, working: `${shown(part, locale)} ÷ ${shown(whole, locale)} = ${displayTyped(made.value, locale)}` } };
};

const applyBp: Runner = ([a, rate], locale) =>
  vndStep(divRoundHalfAway(amount(a) * bpOf(rate), BP), (r) => `${shown(a, locale)} × ${shown(rate, locale)} = ${r}`, locale);

const changeBp: Runner = ([from, to], locale) => {
  if (amount(from) <= 0n) return invalid('starting amount must be above zero');
  const made = toBp(divRoundHalfAway((amount(to) - amount(from)) * BP, amount(from)));
  if (!made.ok) return made;
  return {
    ok: true,
    value: { value: made.value, working: `(${shown(to, locale)} − ${shown(from, locale)}) ÷ ${shown(from, locale)} = ${displayTyped(made.value, locale)}` },
  };
};

const DAYS_UNIT: Record<Locale, string> = { vi: 'ngày', en: 'days' };

const LOAN_LABELS: Record<Locale, { perYear: string; perMonth: string }> = {
  vi: { perYear: '/năm', perMonth: '/tháng' },
  en: { perYear: '/year', perMonth: '/month' },
};

const loanPayment: Runner = ([principal, rate, months], locale) => {
  const n = numberOf(months);
  if (amount(principal) <= 0n) return invalid('principal must be above zero');
  if (bpOf(rate) < 0n) return invalid('rate must not be negative');
  if (n < 1n || n > BigInt(MAX_LOAN_MONTHS)) return invalid(`months must be 1 to ${MAX_LOAN_MONTHS}`);
  const labels = LOAN_LABELS[locale];
  return vndStep(
    loanPaymentExact(amount(principal), bpOf(rate), n),
    (r) => `${shown(principal, locale)}, ${shown(rate, locale)}${labels.perYear}, ${shown(months, locale)} → ${r}${labels.perMonth}`,
    locale,
  );
};

const daysBetweenOp: Runner = ([from, to], locale) => {
  if (from?.kind !== 'date' || to?.kind !== 'date') return invalid('dates required');
  const value: TypedValue = { kind: 'count', value: daysBetween(from.value, to.value), unit: DAYS_UNIT[locale] };
  return { ok: true, value: { value, working: `${shown(from, locale)} → ${shown(to, locale)} = ${displayTyped(value, locale)}` } };
};

function entry(id: string, operands: CalcOp['operands'], result: CalcOp['result'], run: Runner, variadic = false): CalcOp {
  return variadic ? { id, operands, result, variadic, run } : { id, operands, result, run };
}

export const CALC_OPS: readonly CalcOp[] = [
  entry('sum', ['vnd', 'vnd'], 'vnd', sum, true),
  entry('difference', ['vnd', 'vnd'], 'vnd', difference),
  entry('times_count', ['vnd', 'count'], 'vnd', timesCount),
  entry('monthly_to_yearly', ['vnd'], 'vnd', monthlyToYearly),
  entry('yearly_to_monthly', ['vnd'], 'vnd', yearlyToMonthly),
  entry('share_bp', ['vnd', 'vnd'], 'bp', shareBp),
  entry('apply_bp', ['vnd', 'bp'], 'vnd', applyBp),
  entry('change_bp', ['vnd', 'vnd'], 'bp', changeBp),
  entry('loan_payment', ['vnd', 'bp', 'months'], 'vnd', loanPayment),
  entry('days_between', ['date', 'date'], 'count', daysBetweenOp),
];
