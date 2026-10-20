/** LSE-4: how many months of consumption the usual level looks back over, and how far above it a month stands out. */
export const ANOMALY_MONTHS = 6;
export const ANOMALY_FACTOR = 3;

/** The middle value, or the mean of the two middle values; null for no values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * The usual consumption the warning compares with: the median of the last six months, or of every month there is when
 * fewer. Null when there is no history, or when the meter used nothing, since then no month is unusual.
 */
export function usualConsumption(history: readonly number[]): number | null {
  const usual = median(history.slice(-ANOMALY_MONTHS));
  return usual === null || usual === 0 ? null : usual;
}

/** True above three times the usual consumption (LSE-4); exactly three times is not unusual. A warning, never a refusal. */
export function isAnomalous(history: readonly number[], value: number): boolean {
  const usual = usualConsumption(history);
  return usual !== null && value > ANOMALY_FACTOR * usual;
}
