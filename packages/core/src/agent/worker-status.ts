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

export type WallClockStamp = {
  /** The wall-clock time, `HH:mm` in the business timezone. */
  readonly time: string;
  /** The business date when it is earlier than today's, else null. */
  readonly earlierDate: IsoDate | null;
};

/** `paused` is a worker that beats on time but whose last model session hit Claude's usage limit (AGENT.md §9). */
export type WorkerStatus = { readonly kind: 'never' } | ({ readonly kind: 'online' | 'paused' | 'offline' } & WallClockStamp);

/** The newest heartbeat row a member may read. */
export type Heartbeat = { readonly lastSeenAt: Instant; readonly usageLimited: boolean };

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

export function wallTime(instant: Instant, timezone: string): string {
  let formatter = timeFormatters.get(timezone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    timeFormatters.set(timezone, formatter);
  }
  return formatter.format(Date.parse(instant));
}

export function wallClockStamp(instant: Instant, now: Instant, timezone = 'Asia/Ho_Chi_Minh'): WallClockStamp {
  const day = businessDate(instant, timezone);
  return { time: wallTime(instant, timezone), earlierDate: day < businessDate(now, timezone) ? day : null };
}

export function workerStatus(heartbeat: Heartbeat | null, now: Instant, timezone = 'Asia/Ho_Chi_Minh'): WorkerStatus {
  if (heartbeat === null) return { kind: 'never' };
  const { lastSeenAt, usageLimited } = heartbeat;
  const fresh = Date.parse(now) - Date.parse(lastSeenAt) <= OFFLINE_AFTER_MS;
  return { kind: !fresh ? 'offline' : usageLimited ? 'paused' : 'online', ...wallClockStamp(lastSeenAt, now, timezone) };
}
