import { describe, expect, test } from 'vitest';
import type { Instant } from './clock';
import {
  FROZEN_CLOCK_REFUSAL,
  assertClockAllowed,
  businessDate,
  clockAt,
  parseInstant,
  resolveClockSource,
} from './resolve';

const HCM = 'Asia/Ho_Chi_Minh';
const systemNow = '2026-12-31T05:00:00.000Z' as Instant;
const row = { frozen_now: '2026-10-07T02:00:00+00:00' };
const frozenNowEnv = '2026-01-01T09:00:00+07:00';

describe('resolveClockSource', () => {
  test.each(['development', 'test', 'preview', undefined])('ESTA_ENV=%s prefers the table row', (estaEnv) => {
    expect(resolveClockSource({ estaEnv, testClockRow: row, frozenNowEnv, systemNow })).toEqual({
      kind: 'table',
      now: '2026-10-07T02:00:00.000Z',
    });
  });

  test('falls back to ESTA_FROZEN_NOW when the table is empty', () => {
    expect(resolveClockSource({ estaEnv: 'test', testClockRow: null, frozenNowEnv, systemNow })).toEqual({
      kind: 'env',
      now: '2026-01-01T02:00:00.000Z',
    });
  });

  test.each([undefined, ''])('falls back to system time when ESTA_FROZEN_NOW is %j', (frozen) => {
    expect(
      resolveClockSource({ estaEnv: 'development', testClockRow: null, frozenNowEnv: frozen, systemNow }),
    ).toEqual({ kind: 'system', now: systemNow });
  });

  test('production ignores the table row and ESTA_FROZEN_NOW', () => {
    expect(resolveClockSource({ estaEnv: 'production', testClockRow: row, frozenNowEnv, systemNow })).toEqual({
      kind: 'system',
      now: systemNow,
    });
  });
});

describe('businessDate', () => {
  test.each([
    ['2026-10-07T16:59:59Z', '2026-10-07'],
    ['2026-10-07T17:00:00Z', '2026-10-08'],
    ['2026-12-31T17:00:00Z', '2027-01-01'],
  ])('%s is %s in Asia/Ho_Chi_Minh', (iso, expected) => {
    expect(businessDate(parseInstant(iso), HCM)).toBe(expected);
  });

  test('follows the timezone it is given', () => {
    expect(businessDate(parseInstant('2026-10-07T17:00:00Z'), 'UTC')).toBe('2026-10-07');
  });
});

describe('parseInstant', () => {
  test('normalizes any offset to canonical UTC', () => {
    expect(parseInstant('2026-10-08T00:30:00+07:00')).toBe('2026-10-07T17:30:00.000Z');
    expect(parseInstant('2026-10-07T02:00:00.123456+00:00')).toBe('2026-10-07T02:00:00.123Z');
  });

  test.each(['2026-10-07T09:00:00', '2026-10-07', '2026-02-30T09:00:00Z', '2026-10-07T24:00:00Z', 'soon'])(
    'rejects %j',
    (text) => {
      expect(() => parseInstant(text)).toThrow(/Not an ISO date-time with an offset/);
    },
  );
});

describe('clockAt', () => {
  test('returns one instant and its business date for every read', () => {
    const clock = clockAt({ kind: 'table', now: parseInstant('2026-10-07T23:59:00+07:00') }, HCM);
    expect([clock.source, clock.now(), clock.today()]).toEqual(['table', '2026-10-07T16:59:00.000Z', '2026-10-07']);
    expect(clock.now()).toBe(clock.now());
  });
});

describe('assertClockAllowed', () => {
  const frozen = { ESTA_FROZEN_NOW: '2026-10-07T09:00:00+07:00' };

  test('refuses a frozen clock when ESTA_ENV=production', () => {
    expect(() => assertClockAllowed({ ...frozen, ESTA_ENV: 'production' })).toThrow(FROZEN_CLOCK_REFUSAL);
    expect(FROZEN_CLOCK_REFUSAL).toBe('Refusing to start: frozen clock configured while ESTA_ENV=production');
  });

  test('allows a local production build with ESTA_ENV=test', () => {
    expect(() => assertClockAllowed({ ...frozen, NODE_ENV: 'production', ESTA_ENV: 'test' })).not.toThrow();
  });

  test.each([undefined, ''])('allows production without a frozen clock (ESTA_FROZEN_NOW=%j)', (value) => {
    expect(() => assertClockAllowed({ ESTA_ENV: 'production', ESTA_FROZEN_NOW: value })).not.toThrow();
  });
});
