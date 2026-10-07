import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { epochDay, weekday } from '../date/calendar';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import { parseDateInput } from '../parse/date-input';
import { parseStatementAmount } from '../parse/statement';
import { parseVndInput } from '../parse/vnd-input';
import { foldVietnamese } from '../search/fold';
import { formatDate, formatVnd, formatVndCompact } from './index';

const params = { seed: 20261007, numRuns: 1000 };
const amount = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }).map(vnd);
const signedAmount = fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }).map(vnd);
const date = fc
  .date({ min: new Date('1900-01-01T00:00:00Z'), max: new Date('2199-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => isoDate(d.toISOString().slice(0, 10)));

describe('format and parse round trips', () => {
  it('parseVndInput reads back what formatVnd writes, in both locales', () => {
    fc.assert(
      fc.property(amount, fc.constantFrom('vi' as const, 'en' as const), (value, locale) => {
        expect(parseVndInput(formatVnd(value, locale))).toEqual({ ok: true, value });
      }),
      params,
    );
  });

  it('parseStatementAmount reads back signed amounts', () => {
    fc.assert(
      fc.property(signedAmount, (value) => {
        expect(parseStatementAmount(formatVnd(value, 'en').replace(/\s*₫$/, ''))).toEqual({ ok: true, value });
      }),
      params,
    );
  });

  it('formatVndCompact in vi parses back to within half its last digit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_000, max: 9_000_000_000_000 }).map(vnd), (value) => {
        const compact = formatVndCompact(value, 'vi');
        const parsed = parseVndInput(compact);
        if (!parsed.ok) throw new Error(`${compact} did not parse`);
        const step = compact.endsWith('tỷ') ? 10_000_000 : compact.endsWith('tr') ? 100_000 : 1_000;
        expect(Math.abs(parsed.value - value)).toBeLessThanOrEqual(step / 2);
      }),
      params,
    );
  });

  it('parseDateInput reads back what formatDate writes', () => {
    fc.assert(
      fc.property(date, (value) => {
        expect(parseDateInput(formatDate(value, 'vi'))).toEqual({ ok: true, value });
      }),
      params,
    );
  });
});

describe('calendar arithmetic', () => {
  it('agrees with UTC epoch days and weekdays', () => {
    fc.assert(
      fc.property(date, (value) => {
        const utc = new Date(`${value}T00:00:00Z`);
        expect(epochDay(value)).toBe(utc.getTime() / 86_400_000);
        expect(weekday(value)).toBe(utc.getUTCDay());
      }),
      params,
    );
  });
});

describe('foldVietnamese', () => {
  it('is idempotent and leaves no combining marks or đ', () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom(...'aăâđeêioôơuưyAĂÂĐEÊIOÔƠUƯY àảãáạằẳẵắặầẩẫấậ'.split('')) }), (text) => {
        const folded = foldVietnamese(text);
        expect(foldVietnamese(folded)).toBe(folded);
        expect(folded).toMatch(/^[a-z ]*$/);
      }),
      params,
    );
  });
});
