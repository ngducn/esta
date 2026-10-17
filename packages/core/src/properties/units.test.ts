import { describe, expect, it } from 'vitest';
import { compareUnits, moveUnit, nextRoomLabels } from './units';

describe('nextRoomLabels', () => {
  it('continues after the highest room', () => {
    expect(nextRoomLabels(['Phòng 1', 'Phòng 2', 'Phòng 3', 'Phòng 4', 'Phòng 5', 'Phòng 6', 'Phòng 7', 'Phòng 8'], 1)).toEqual(['Phòng 9']);
  });

  it('continues after the highest room across gaps, without filling them', () => {
    expect(nextRoomLabels(['Phòng 1', 'Phòng 4', 'Phòng 2'], 2)).toEqual(['Phòng 5', 'Phòng 6']);
  });

  it('ignores labels that are not Phòng n and starts at 1 with none', () => {
    expect(nextRoomLabels(['Toàn bộ', 'Tầng trệt', 'Phòng VIP', 'Ki-ốt 3'], 3)).toEqual(['Phòng 1', 'Phòng 2', 'Phòng 3']);
    expect(nextRoomLabels([], 2)).toEqual(['Phòng 1', 'Phòng 2']);
  });

  it('reads case, spacing, leading zeros and decomposed marks as the same room', () => {
    expect(nextRoomLabels(['  phòng  07 ', 'Phòng 3'], 1)).toEqual(['Phòng 8']);
  });

  it('returns nothing for a count of zero or less', () => {
    expect(nextRoomLabels(['Phòng 1'], 0)).toEqual([]);
    expect(nextRoomLabels(['Phòng 1'], -2)).toEqual([]);
  });
});

const units = [
  { id: 'c', label: 'Phòng 3', sort_order: 2 },
  { id: 'a', label: 'Phòng 1', sort_order: 0 },
  { id: 'b', label: 'Phòng 2', sort_order: 1 },
];

describe('moveUnit', () => {
  it('swaps a unit with the one above and returns only the two changed values', () => {
    expect(moveUnit(units, 'b', 'up')).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
    ]);
  });

  it('swaps a unit with the one below', () => {
    expect(moveUnit(units, 'b', 'down')).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
  });

  it('changes nothing when the first unit moves up or the last moves down', () => {
    expect(moveUnit(units, 'a', 'up')).toEqual([]);
    expect(moveUnit(units, 'c', 'down')).toEqual([]);
  });

  it('changes nothing for an unknown id', () => {
    expect(moveUnit(units, 'z', 'up')).toEqual([]);
  });

  it('numbers a list whose values tie, so the move still shows', () => {
    const tied = [
      { id: 'x', label: 'Phòng 10', sort_order: 0 },
      { id: 'y', label: 'Phòng 9', sort_order: 0 },
    ];
    expect(tied.toSorted(compareUnits).map((unit) => unit.label)).toEqual(['Phòng 9', 'Phòng 10']);
    expect(moveUnit(tied, 'x', 'up')).toEqual([{ id: 'y', sort_order: 1 }]);
  });
});
