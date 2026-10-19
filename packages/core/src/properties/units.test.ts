import { describe, expect, it } from 'vitest';
import { compareRoomLabels, compareUnits, moveUnit, nextRoomLabels, sortByRoomNumber } from './units';

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

const shown = (labels: readonly string[]) => labels.map((label, index) => ({ id: `u${index}`, label, sort_order: index }));
const afterSort = (labels: readonly string[]) => {
  const units = shown(labels);
  const changes = new Map(sortByRoomNumber(units).map((change) => [change.id, change.sort_order]));
  return units
    .map((unit) => ({ ...unit, sort_order: changes.get(unit.id) ?? unit.sort_order }))
    .toSorted(compareUnits)
    .map((unit) => unit.label);
};

describe('compareRoomLabels', () => {
  it('reads the number inside a label as a number', () => {
    expect(['Phòng 10', 'Phòng 2', 'Phòng 1'].toSorted(compareRoomLabels)).toEqual(['Phòng 1', 'Phòng 2', 'Phòng 10']);
    expect(['Tầng 2 Phòng 10', 'Tầng 1 Phòng 12'].toSorted(compareRoomLabels)).toEqual(['Tầng 1 Phòng 12', 'Tầng 2 Phòng 10']);
  });

  it('orders Vietnamese labels by the Vietnamese alphabet and reads decomposed marks as the same label', () => {
    expect(['Phòng Đ1', 'Phòng E1', 'Phòng D2'].toSorted(compareRoomLabels)).toEqual(['Phòng D2', 'Phòng Đ1', 'Phòng E1']);
    expect(compareRoomLabels('Phòng 1'.normalize('NFD'), 'Phòng 1')).toBe(0);
  });

  it('puts a label with a number before a label without one, and calls two without a number equal', () => {
    expect(compareRoomLabels('Phòng 99', 'Gác lửng')).toBeLessThan(0);
    expect(compareRoomLabels('Toàn bộ', 'Phòng 1')).toBeGreaterThan(0);
    expect(compareRoomLabels('Tầng trệt', 'Gác lửng')).toBe(0);
  });
});

describe('sortByRoomNumber', () => {
  it('puts a reordered list back in room-number order', () => {
    expect(afterSort(['Phòng 10', 'Phòng 3', 'Phòng 1', 'Phòng 2'])).toEqual(['Phòng 1', 'Phòng 2', 'Phòng 3', 'Phòng 10']);
  });

  it('keeps labels without a number after the numbered ones, in the order they showed', () => {
    expect(afterSort(['Tầng trệt', 'Phòng 2', 'Gác lửng', 'Phòng 1'])).toEqual(['Phòng 1', 'Phòng 2', 'Tầng trệt', 'Gác lửng']);
  });

  it('keeps labels the collator reads as the same number in the order they showed', () => {
    expect(afterSort(['Phòng 2', 'Phòng 1', 'Phòng 01'])).toEqual(['Phòng 1', 'Phòng 01', 'Phòng 2']);
    expect(afterSort(['Phòng 2', 'Phòng 01', 'Phòng 1'])).toEqual(['Phòng 01', 'Phòng 1', 'Phòng 2']);
  });

  it('returns only the rows whose place changes, and nothing for a list already in order', () => {
    expect(sortByRoomNumber(shown(['Phòng 1', 'Phòng 3', 'Phòng 2', 'Phòng 4']))).toEqual([
      { id: 'u2', sort_order: 1 },
      { id: 'u1', sort_order: 2 },
    ]);
    expect(sortByRoomNumber(shown(['Phòng 1', 'Phòng 2', 'Phòng 10']))).toEqual([]);
  });

  it('numbers a list whose values tie from 0', () => {
    const tied = [
      { id: 'x', label: 'Phòng 10', sort_order: 4 },
      { id: 'y', label: 'Phòng 9', sort_order: 4 },
    ];
    expect(sortByRoomNumber(tied)).toEqual([
      { id: 'y', sort_order: 0 },
      { id: 'x', sort_order: 1 },
    ]);
  });
});
