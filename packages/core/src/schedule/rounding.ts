import { vnd, type Vnd } from '../money/vnd';

/** numerator ÷ denominator rounded half up to a multiple of `multiple`, exact at any magnitude. */
export function roundHalfUpToMultiple(numerator: number, denominator: number, multiple: number): Vnd {
  const unit = BigInt(denominator) * BigInt(multiple);
  const quotient = (2n * BigInt(numerator) + unit) / (2n * unit);
  return vnd(Number(quotient * BigInt(multiple)));
}
