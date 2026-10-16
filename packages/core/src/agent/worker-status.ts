import type { Instant } from '../clock/clock';
import { businessDate } from '../clock/resolve';
import type { IsoDate } from '../date/iso-date';

export const OFFLINE_AFTER_MS = 5 * 60_000;

/**
 * Worker and web hosts may disagree by a few seconds. The margin stays well under the minute between beats,
 * so a row a stopped worker wrote under a later test clock is still not read.
 */
export const HEARTBEAT_SKEW_MS = 10_000;

export function heartbeatReadBound(now: Instant): Instant {
  return new Date(Date.parse(now) + HEARTBEAT_SKEW_MS).toISOString() as Instant;
}

export type WorkerStatus =
  | { readonly kind: 'never' }
  | {
      readonly kind: 'online' | 'offline';
      /** The heartbeat's wall-clock time, `HH:mm` in the business timezone. */
      readonly time: string;
      /** The heartbeat's business date when it is earlier than today's, else null. */
      readonly earlierDate: IsoDate | null;
    };

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

export function wallTime(instant: Instant, timezone: string): string {
  let formatter = timeFormatters.get(timezone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    timeFormatters.set(timezone, formatter);
  }
  return formatter.format(Date.parse(instant));
}

export function workerStatus(lastSeenAt: Instant | null, now: Instant, timezone = 'Asia/Ho_Chi_Minh'): WorkerStatus {
  if (lastSeenAt === null) return { kind: 'never' };
  const seenOn = businessDate(lastSeenAt, timezone);
  return {
    kind: Date.parse(now) - Date.parse(lastSeenAt) <= OFFLINE_AFTER_MS ? 'online' : 'offline',
    time: wallTime(lastSeenAt, timezone),
    earlierDate: seenOn < businessDate(now, timezone) ? seenOn : null,
  };
}
