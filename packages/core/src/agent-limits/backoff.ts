import type { Instant } from '../clock/clock';

/** Minutes from a failed attempt to the next one: 1, 5, then 25 for every later attempt (AGENT.md §2.1). */
export const RETRY_BACKOFF_MINUTES = [1, 5, 25] as const;

/**
 * When the next attempt runs after attempt number `attempt` (counting from 1) failed at `failedAt`, or null when the
 * job has used all `maxAttempts`.
 */
export function retryAt(attempt: number, maxAttempts: number, failedAt: Instant): Instant | null {
  if (attempt >= maxAttempts) return null;
  const minutes = RETRY_BACKOFF_MINUTES[Math.min(Math.max(attempt, 1), RETRY_BACKOFF_MINUTES.length) - 1] ?? RETRY_BACKOFF_MINUTES[0];
  return new Date(Date.parse(failedAt) + minutes * 60_000).toISOString() as Instant;
}
