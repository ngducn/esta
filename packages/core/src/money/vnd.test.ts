import { describe, expect, it } from 'vitest';
import { vnd } from './vnd';

describe('vnd', () => {
  it('accepts safe integers, including zero and negatives', () => {
    expect(vnd(15_000_000)).toBe(15_000_000);
    expect(vnd(0)).toBe(0);
    expect(vnd(-1_500_000)).toBe(-1_500_000);
    expect(vnd(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('stores negative zero as zero', () => {
    expect(Object.is(vnd(-0), 0)).toBe(true);
  });

  it.each([1.5, 2 ** 53, -(2 ** 53), Number.NaN, Number.POSITIVE_INFINITY])('throws on %s', (n) => {
    expect(() => vnd(n)).toThrow(RangeError);
  });
});
