import { vnd, type Vnd } from '../money/vnd';

/** amount × numerator ÷ denominator rounded half up to a multiple of `multiple`, exact at any magnitude. */
export function scaleRoundHalfUp(amount: Vnd, numerator: number, denominator: number, multiple: number): Vnd {
  const unit = BigInt(denominator) * BigInt(multiple);
  const quotient = (2n * BigInt(amount) * BigInt(numerator) + unit) / (2n * unit);
  return vnd(Number(quotient * BigInt(multiple)));
}
