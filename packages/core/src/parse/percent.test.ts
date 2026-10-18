import { describe, expect, it } from 'vitest';
import { parsePercentBps } from './percent';

describe('parsePercentBps', () => {
  it.each([
    ['5', 500],
    ['5,5', 550],
    ['2.25', 225],
    ['10 %', 1000],
    ['100', 10_000],
  ])('reads %s as %i basis points', (text, bps) => {
    expect(parsePercentBps(text)).toEqual({ ok: true, value: bps });
  });

  it.each(['', '0', '0,001', '101', 'năm', '5.000'])('refuses %s', (text) => {
    expect(parsePercentBps(text).ok).toBe(false);
  });
});
