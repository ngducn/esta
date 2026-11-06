import { describe, expect, it } from 'vitest';
import { businessDate } from './resolve';
import { clockEdges } from './edges';

describe('clockEdges', () => {
  it.each(clockEdges())('names the business date of $name', ({ now, businessDate: expected }) => {
    expect(businessDate(now, 'Asia/Ho_Chi_Minh')).toBe(expected);
  });

  it('holds the cases a keyed test must cover: both sides of midnight, Sunday to Monday, a month end, the frozen clock', () => {
    const dates = clockEdges().map((edge) => edge.businessDate);
    expect(dates).toEqual(expect.arrayContaining(['2026-10-11', '2026-10-12', '2026-10-31', '2026-11-01', '2026-10-07']));
  });
});
