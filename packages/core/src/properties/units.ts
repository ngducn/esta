const ROOM_LABEL = /^phòng\s+0*([0-9]{1,6})$/iu;

/** `count` labels after the highest `Phòng n`, so gaps stay gaps and labels that are not `Phòng n` are ignored. */
export function nextRoomLabels(existingLabels: readonly string[], count: number): string[] {
  const numbers = existingLabels.map((label) => ROOM_LABEL.exec(label.normalize('NFC').trim())?.[1]).filter((n) => n !== undefined);
  const highest = Math.max(0, ...numbers.map(Number));
  return Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, index) => `Phòng ${highest + index + 1}`);
}

export type Ordered = { readonly id: string; readonly label: string; readonly sort_order: number };

const collator = new Intl.Collator('vi', { numeric: true });

/** The order the list shows: `sort_order`, then the label as people count it, so `Phòng 9` comes before `Phòng 10`. */
export function compareUnits(a: Ordered, b: Ordered): number {
  return a.sort_order - b.sort_order || collator.compare(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export type SortChange = { readonly id: string; readonly sort_order: number };

/** Numbers the list from 0 and returns only the rows whose `sort_order` changes. */
function renumber(ordered: readonly Ordered[]): SortChange[] {
  return ordered.flatMap((unit, index) => (unit.sort_order === index ? [] : [{ id: unit.id, sort_order: index }]));
}

/**
 * Swaps the unit with its neighbour, returning the two swapped units when the list is already numbered and more when
 * equal values left the order to the labels.
 */
export function moveUnit(units: readonly Ordered[], unitId: string, direction: 'up' | 'down'): SortChange[] {
  const ordered = units.toSorted(compareUnits);
  const from = ordered.findIndex((unit) => unit.id === unitId);
  const to = direction === 'up' ? from - 1 : from + 1;
  const [moving, neighbour] = [ordered[from], ordered[to]];
  if (from === -1 || moving === undefined || neighbour === undefined) return [];
  return renumber(ordered.with(from, neighbour).with(to, moving));
}

const HAS_NUMBER = /[0-9]/;

/**
 * Room-number order: `Phòng 2` before `Phòng 10`, and every label with a number before every label without one. Two
 * labels without a number, or two the collator reads as the same (`Phòng 01` and `Phòng 1`), compare equal, so a
 * stable sort keeps them where they were.
 */
export function compareRoomLabels(a: string, b: string): number {
  const [numberedA, numberedB] = [HAS_NUMBER.test(a), HAS_NUMBER.test(b)];
  if (numberedA !== numberedB) return numberedA ? -1 : 1;
  return numberedA ? collator.compare(a, b) : 0;
}

/** `Xếp theo số phòng`: the list as it shows now, re-sorted by `compareRoomLabels` and numbered from 0. */
export function sortByRoomNumber(units: readonly Ordered[]): SortChange[] {
  return renumber(units.toSorted(compareUnits).toSorted((a, b) => compareRoomLabels(a.label, b.label)));
}
