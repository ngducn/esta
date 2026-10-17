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

/**
 * Swaps the unit with its neighbour and numbers the list from 0, returning only the rows whose `sort_order` changes:
 * the two swapped units when the list is already numbered, more when equal values left the order to the labels.
 */
export function moveUnit(units: readonly Ordered[], unitId: string, direction: 'up' | 'down'): SortChange[] {
  const ordered = units.toSorted(compareUnits);
  const from = ordered.findIndex((unit) => unit.id === unitId);
  const to = direction === 'up' ? from - 1 : from + 1;
  const [moving, neighbour] = [ordered[from], ordered[to]];
  if (from === -1 || moving === undefined || neighbour === undefined) return [];
  const swapped = ordered.with(from, neighbour).with(to, moving);
  return swapped.flatMap((unit, index) => (unit.sort_order === index ? [] : [{ id: unit.id, sort_order: index }]));
}
