import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { readValuation, valuationSchema } from './schema';

const today = isoDate('2026-10-07');
const base = {
  id: '6f1c2b8e-9a4d-4c3e-8f7a-1b2c3d4e5f60',
  propertyId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  method: 'broker_quote',
  value: '9ty5',
};

function read(input: object) {
  const read = readValuation({ ...base, ...input }, today);
  if (!read.ok) throw new Error(`refused: ${JSON.stringify(read.reason)}`);
  return read.value;
}

function problems(input: object) {
  const read = readValuation({ ...base, ...input }, today);
  if (read.ok) throw new Error('expected a refusal');
  return read.reason;
}

describe('readValuation', () => {
  it('reads 1ty2 as 1.200.000.000 đồng (FIN-5)', () => {
    expect(read({ value: '1ty2' }).valueVnd).toBe(1_200_000_000);
  });

  it('reads a broker quote of 9ty5 dated 07/10/2026 with its https source', () => {
    expect(read({ asOf: '07/10/2026', sourceUrl: ' https://example.com/bao-gia ', note: ' ' })).toEqual({
      id: base.id,
      propertyId: base.propertyId,
      method: 'broker_quote',
      valueVnd: 9_500_000_000,
      asOf: '2026-10-07',
      sourceUrl: 'https://example.com/bao-gia',
      note: null,
    });
  });

  it('dates an empty date on the Clock day', () => {
    expect(read({ asOf: '' }).asOf).toBe('2026-10-07');
  });

  it.each([
    ['HTTPS://example.com', 'https://example.com/'],
    ['Https://example.com/x', 'https://example.com/x'],
    ['https:example.com', 'https://example.com/'],
    ['https:/example.com', 'https://example.com/'],
    ['https:\\\\example.com', 'https://example.com/'],
    ['https://Example.com/Bao-Gia', 'https://example.com/Bao-Gia'],
    ['https://example.com/báo-giá', 'https://example.com/b%C3%A1o-gi%C3%A1'],
  ])('stores %j as the link it opens, %j', (typed, href) => {
    expect(read({ sourceUrl: typed }).sourceUrl).toBe(href);
  });

  it('refuses a link that grows past 2000 characters once encoded', () => {
    expect(problems({ sourceUrl: `https://example.com/${'đ'.repeat(400)}` })).toEqual({ sourceUrl: 'not_https' });
  });

  it('refuses https: without a host and a link with a space', () => {
    for (const sourceUrl of ['https:', 'https://', 'https:///', 'https://example.com/a b']) expect(problems({ sourceUrl })).toEqual({ sourceUrl: 'not_https' });
  });

  it('refuses an http: source on its field', () => {
    expect(problems({ sourceUrl: 'http://example.com' })).toEqual({ sourceUrl: 'not_https' });
  });

  it('refuses a script link and a text that is not a link', () => {
    expect(problems({ sourceUrl: 'javascript:alert(1)' })).toEqual({ sourceUrl: 'not_https' });
    expect(problems({ sourceUrl: 'môi giới nói' })).toEqual({ sourceUrl: 'not_https' });
  });

  it('refuses a date after the Clock day', () => {
    expect(problems({ asOf: '08/10/2026' })).toEqual({ asOf: 'after_today' });
  });

  it('refuses 0, an empty value and a date that is not on the calendar, each on its field and all at once', () => {
    expect(problems({ value: '0', asOf: '31/02/2026', sourceUrl: 'http://a.vn' })).toEqual({ value: 'not_positive', asOf: 'impossible', sourceUrl: 'not_https' });
    expect(problems({ value: '' })).toEqual({ value: 'empty' });
  });

  it('refuses a method outside the four as a form problem', () => {
    expect(problems({ method: 'guess' })).toEqual({ form: 'invalid' });
  });
});

describe('valuationSchema', () => {
  const row = { id: base.id, propertyId: base.propertyId, asOf: '2026-07-01', valueVnd: 9_500_000_000, method: 'comparables', sourceUrl: null, note: null };

  it('takes a stored row', () => {
    expect(valuationSchema.parse(row).valueVnd).toBe(9_500_000_000);
  });

  it('gives a capitalised https source as the link it opens', () => {
    expect(valuationSchema.parse({ ...row, sourceUrl: 'Https://example.com/x' }).sourceUrl).toBe('https://example.com/x');
  });

  it('refuses a value of 0 and an http: source', () => {
    expect(valuationSchema.safeParse({ ...row, valueVnd: 0 }).success).toBe(false);
    expect(valuationSchema.safeParse({ ...row, sourceUrl: 'http://example.com' }).success).toBe(false);
  });
});
