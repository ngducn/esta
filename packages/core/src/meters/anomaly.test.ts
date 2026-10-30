import { describe, expect, it } from 'vitest';
import { median, unusualUse } from './anomaly';

describe('the 3× six-month median warning (LSE-4)', () => {
  const sixMonths = [110, 95, 130, 120, 100, 125];

  it('stays quiet for a normal month', () => {
    expect(unusualUse(sixMonths, [], 140)).toBeNull();
  });

  it('stays quiet at exactly three times the median', () => {
    expect(unusualUse(sixMonths, [], 345)).toBeNull();
  });

  it('warns above three times the median', () => {
    expect(unusualUse(sixMonths, [], 346)).toEqual({ basis: 'history', usual: 115 });
    expect(unusualUse(sixMonths, [], 1200)).toEqual({ basis: 'history', usual: 115 });
  });

  it('looks back only six months', () => {
    expect(unusualUse([1000, 1000, 1000, ...sixMonths], [], 346)).toEqual({ basis: 'history', usual: 115 });
  });

  it('uses every month there is when fewer than six', () => {
    expect(unusualUse([120], [], 361)).toEqual({ basis: 'history', usual: 120 });
    expect(unusualUse([100, 140], [], 360)).toBeNull();
    expect(unusualUse([100, 140], [], 361)).toEqual({ basis: 'history', usual: 120 });
  });

  it('has nothing to compare with before a month of history, or when the meter used nothing', () => {
    expect(unusualUse([], [], 5000)).toBeNull();
    expect(unusualUse([0, 0, 0], [], 50)).toBeNull();
  });

  it('takes the middle value, or the mean of the two middle values', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('the other rooms this month, for a meter with no history (#356)', () => {
  const inLine = [6, 7, 8, 9];
  const electricityTypedAsWater = [2081, 5299, 3705, 787];
  const water: Readonly<Record<number, number>> = Object.fromEntries([...inLine, ...electricityTypedAsWater].map((used, index) => [index + 1, used]));
  const others = (room: number) => Object.entries(water).flatMap(([key, used]) => (Number(key) === room ? [] : [used]));

  it('warns on each typing slip against the median of the other seven rooms', () => {
    for (const room of [5, 6, 7, 8]) expect(unusualUse([], others(room), water[room] ?? 0), `Phòng ${room}`).toEqual({ basis: 'rooms', usual: 9 });
  });

  it('stays quiet for the rooms in line with each other', () => {
    for (const room of [1, 2, 3, 4]) expect(unusualUse([], others(room), water[room] ?? 0), `Phòng ${room}`).toBeNull();
  });

  it('warns only above three times the rooms’ median', () => {
    expect(unusualUse([], [6, 8, 10], 24)).toBeNull();
    expect(unusualUse([], [6, 8, 10], 25)).toEqual({ basis: 'rooms', usual: 8 });
  });

  it('needs three other rooms that used something, since an empty room says nothing about a usual month', () => {
    expect(unusualUse([], [6, 8], 5000)).toBeNull();
    expect(unusualUse([], [0, 0, 6, 8], 5000)).toBeNull();
    expect(unusualUse([], [0, 6, 7, 8], 5000)).toEqual({ basis: 'rooms', usual: 7 });
  });

  it('keeps the meter’s own months first, so a room that always uses more is not flagged against the others', () => {
    expect(unusualUse([30, 32, 28], [6, 7, 8], 31)).toBeNull();
    expect(unusualUse([0, 0], [6, 7, 8], 50)).toEqual({ basis: 'rooms', usual: 7 });
  });
});
