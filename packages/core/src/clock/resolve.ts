import { isIsoDate, type IsoDate } from '../date/iso-date';
import type { Clock, ClockSource, Instant } from './clock';

export const FROZEN_CLOCK_REFUSAL = 'Refusing to start: frozen clock configured while ESTA_ENV=production';

// An explicit offset is required: without one, Date.parse reads the host's local zone.
const OFFSET_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseInstant(text: string): Instant {
  const match = OFFSET_DATE_TIME.exec(text);
  if (match?.[1] === undefined || !isIsoDate(match[1])) {
    throw new Error(`Not an ISO date-time with an offset: "${text}"`);
  }
  return new Date(Date.parse(text)).toISOString() as Instant;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function businessDate(instant: Instant, timezone: string): IsoDate {
  let formatter = formatters.get(timezone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(Date.parse(instant)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}` as IsoDate;
}

export type ClockInputs = {
  estaEnv: string | undefined;
  testClockRow: { frozen_now: string } | null;
  frozenNowEnv: string | undefined;
  systemNow: Instant;
};

export function resolveClockSource({ estaEnv, testClockRow, frozenNowEnv, systemNow }: ClockInputs): ClockSource {
  if (estaEnv === 'production') return { kind: 'system', now: systemNow };
  if (testClockRow !== null) return { kind: 'table', now: parseInstant(testClockRow.frozen_now) };
  if (frozenNowEnv !== undefined && frozenNowEnv !== '') return { kind: 'env', now: parseInstant(frozenNowEnv) };
  return { kind: 'system', now: systemNow };
}

export function clockAt(source: ClockSource, timezone: string): Clock {
  const today = businessDate(source.now, timezone);
  return { source: source.kind, now: () => source.now, today: () => today };
}

export function assertClockAllowed(env: Readonly<Record<string, string | undefined>>): void {
  if (env.ESTA_ENV === 'production' && env.ESTA_FROZEN_NOW !== undefined && env.ESTA_FROZEN_NOW !== '') {
    throw new Error(FROZEN_CLOCK_REFUSAL);
  }
}
