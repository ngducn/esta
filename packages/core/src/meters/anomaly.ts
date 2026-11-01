/** LSE-4: how many months of consumption the usual level looks back over, and how far above it a month stands out. */
export const ANOMALY_MONTHS = 6;
export const ANOMALY_FACTOR = 3;
/** How many other rooms must have used something this month before their median stands in for a meter's own months (#356). */
export const ANOMALY_ROOMS = 3;

export type UsualUse = { readonly basis: 'history' | 'rooms'; readonly usual: number };

/** The middle value, or the mean of the two middle values; null for no values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function usualUse(history: readonly number[], otherRooms: readonly number[]): UsualUse | null {
  const own = median(history.slice(-ANOMALY_MONTHS));
  if (own !== null && own > 0) return { basis: 'history', usual: own };
  const used = otherRooms.filter((amount) => amount > 0);
  const others = used.length >= ANOMALY_ROOMS ? median(used) : null;
  return others === null ? null : { basis: 'rooms', usual: others };
}

/** The usual level `used` stands more than three times above (LSE-4), or null; exactly three times is not unusual. A warning, never a refusal. */
export function unusualUse(history: readonly number[], otherRooms: readonly number[], used: number): UsualUse | null {
  const usual = usualUse(history, otherRooms);
  return usual !== null && used > ANOMALY_FACTOR * usual.usual ? usual : null;
}
