import { describe, expect, it } from 'vitest';
import { scaleRoundHalfUp } from './round';
import { vnd } from './vnd';

const scaled = (amount: number, numerator: number, denominator: number, multiple: number) => scaleRoundHalfUp(vnd(amount), numerator, denominator, multiple);

describe('scaleRoundHalfUp', () => {
  it('rounds a half up and anything under it down, to the dong', () => {
    expect(scaled(10, 1, 4, 1)).toBe(3);
    expect(scaled(10, 1, 3, 1)).toBe(3);
    expect(scaled(11, 1, 3, 1)).toBe(4);
    expect(scaled(1_000, 1, 3, 1)).toBe(333);
  });

  it('rounds to the nearest multiple, a half going up', () => {
    expect(scaled(1_234_499, 1, 1, 1_000)).toBe(1_234_000);
    expect(scaled(1_234_500, 1, 1, 1_000)).toBe(1_235_000);
    expect(scaled(1_234_567, 1, 1, 1_000)).toBe(1_235_000);
    expect(scaled(10_000_000, 1, 3, 1_000)).toBe(3_333_000);
    expect(scaled(10_000_000, 2, 3, 500)).toBe(6_666_500);
  });

  it('is exact where a float product would lose digits', () => {
    expect(scaled(999_999_999_999, 999_999, 1_000_000, 1)).toBe(999_998_999_999);
    expect(scaled(0, 5, 7, 1)).toBe(0);
  });
});
