import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { IsoDate } from '../date/iso-date';
import { isoDate } from '../date/iso-date';
import { formatArea, formatDate, formatDateLong, formatRelativeDue, formatVnd, formatVndCompact, type Locale } from '../format';
import { vnd } from '../money/vnd';
import { checkNumbers } from './checkNumbers';
import { collectAllowed } from './collectAllowed';
import { extractNumbers } from './extractNumbers';
import { COMPACT_RULES } from './normalize';

const params = { seed: 20261007, numRuns: 1000 };
const locale = fc.constantFrom<Locale>('vi', 'en');
const amount = fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }).map(vnd);
const compactAmount = fc.integer({ min: -9_000_000_000_000, max: 9_000_000_000_000 }).filter((n) => Math.abs(n) >= 1_000).map(vnd);
const date = fc
  .date({ min: new Date('1900-01-01T00:00:00Z'), max: new Date('2199-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => isoDate(d.toISOString().slice(0, 10)));
const context = { today: '2026-10-07' as IsoDate, householdName: 'Gia đình Demo' };
const percentFormats: Record<Locale, Intl.NumberFormat> = {
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
};

const passes = (text: string, result: unknown): boolean => checkNumbers(text, collectAllowed([{ tool: 'tool', result }], context)).ok;

function compactUnitOf(text: string): 'ty' | 'tr' | 'nghin' {
  if (/tỷ|B ₫/u.test(text)) return 'ty';
  if (/tr|M ₫/u.test(text)) return 'tr';
  return 'nghin';
}

describe('DOMAIN-VN formatters round-trip through the guard', () => {
  it('formatVnd extracts as exactly that amount and passes against the raw value', () => {
    fc.assert(
      fc.property(amount, locale, (value, loc) => {
        const text = formatVnd(value, loc);
        expect(extractNumbers(text).map((number) => number.value)).toEqual([{ kind: 'amount', vnd: value }]);
        expect(passes(text, { value })).toBe(true);
        expect(passes(text, { value: value + 1 })).toBe(false);
      }),
      params,
    );
  });

  it('formatVndCompact extracts as one compact claim that passes against the raw value', () => {
    fc.assert(
      fc.property(compactAmount, locale, (value, loc) => {
        const text = formatVndCompact(value, loc);
        const [claim, ...rest] = extractNumbers(text).map((number) => number.value);
        expect(rest).toEqual([]);
        expect(claim?.kind).toBe('compact');
        expect(passes(text, { value })).toBe(true);
      }),
      params,
    );
  });

  it('a compact claim passes against every amount that formats the same way and fails beyond one step', () => {
    fc.assert(
      fc.property(compactAmount, compactAmount, locale, (claimed, actual, loc) => {
        const text = formatVndCompact(claimed, loc);
        const rule = COMPACT_RULES[compactUnitOf(text)];
        if (formatVndCompact(actual, loc) === text) expect(passes(text, { actual })).toBe(true);
        if (Math.abs(actual - claimed) > rule.step) expect(passes(text, { actual })).toBe(false);
      }),
      params,
    );
  });

  it('formatDate and formatDateLong extract as that date', () => {
    fc.assert(
      fc.property(date, locale, (value, loc) => {
        for (const text of [formatDate(value, loc), formatDateLong(value, loc)]) {
          expect(extractNumbers(text).map((number) => number.value)).toEqual([{ kind: 'date', iso: value }]);
          expect(passes(text, { on: value })).toBe(true);
        }
      }),
      params,
    );
  });

  it('formatRelativeDue passes against the raw day count and fails one day off', () => {
    fc.assert(
      fc.property(date, fc.integer({ min: -400, max: 400 }).filter((n) => n !== 0), locale, (today, offset, loc) => {
        const due = isoDate(new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10));
        const text = formatRelativeDue(due, today, loc);
        expect(passes(text, { days: Math.abs(offset) })).toBe(true);
        expect(passes(text, { days: Math.abs(offset) + 1 })).toBe(false);
      }),
      params,
    );
  });

  it('formatArea extracts as that area', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), locale, (hundredths, loc) => {
        const value = hundredths / 100;
        const text = formatArea(value, loc);
        expect(extractNumbers(text).map((number) => number.value)).toEqual([{ kind: 'area', m2: value }]);
        expect(passes(text, { area_m2: value })).toBe(true);
      }),
      params,
    );
  });

  it('a percentage display equals its basis points', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), locale, (bp, loc) => {
        const text = `${percentFormats[loc].format(bp / 100)}%`;
        expect(extractNumbers(text).map((number) => number.value)).toEqual([{ kind: 'ratio', bp }]);
        expect(passes(text, { rate_bp: bp })).toBe(true);
        expect(passes(text, { rate_bp: bp + 1 })).toBe(false);
      }),
      params,
    );
  });

  it('a percentage never matches the same digits outside a basis-point field', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), locale, (bp, loc) => {
        const text = `${percentFormats[loc].format(bp / 100)}%`;
        expect(passes(text, { area_m2: bp, rent: bp, days_overdue: bp })).toBe(false);
      }),
      params,
    );
  });

  it('the spoken shorthand 3tr5 passes against the amount it names and fails one step away', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999 }), fc.integer({ min: 1, max: 9 }), (whole, tenth) => {
        const named = (whole * 10 + tenth) * 100_000;
        expect(passes(`${whole}tr${tenth}`, { rent: named })).toBe(true);
        expect(passes(`${whole}tr${tenth}`, { rent: named + 100_000 })).toBe(false);
      }),
      params,
    );
  });
});
