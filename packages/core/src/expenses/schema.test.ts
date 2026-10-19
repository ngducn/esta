import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_IDS } from './categories';
import { expenseInputSchema, expenseProblems } from './schema';

const today = isoDate('2026-10-07');
const schema = expenseInputSchema(today);
const base = {
  id: '6f1c2b8e-9a4d-4c3e-8f7a-1b2c3d4e5f60',
  propertyId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  category: 'repair',
  amount: '2tr5',
  vendor: null,
  documentId: null,
};

function problems(input: object) {
  const parsed = schema.safeParse({ ...base, ...input });
  if (parsed.success) throw new Error('expected a refusal');
  return expenseProblems(parsed.error);
}

describe('expenseInputSchema', () => {
  it('reads 3tr5 as 3.500.000 đồng', () => {
    expect(schema.parse({ ...base, amount: '3tr5' }).amount).toBe(3_500_000);
  });

  it('refuses 0 as not positive', () => {
    expect(problems({ amount: '0' })).toEqual({ amount: 'not_positive' });
  });

  it('refuses a negative amount', () => {
    expect(problems({ amount: '-850000' })).toEqual({ amount: 'invalid' });
  });

  it('refuses a fractional đồng', () => {
    expect(problems({ amount: '1500,5' })).toEqual({ amount: 'fractional' });
  });

  it('refuses an empty amount rather than reading it as 0', () => {
    expect(problems({ amount: '' })).toEqual({ amount: 'empty' });
  });

  it('dates the expense on the Clock date when the date is left empty', () => {
    expect(schema.parse(base).paidOn).toBe('2026-10-07');
    expect(schema.parse({ ...base, paidOn: '  ' }).paidOn).toBe('2026-10-07');
  });

  it('reads a typed day and refuses one after the Clock date', () => {
    expect(schema.parse({ ...base, paidOn: '15/09/2026' }).paidOn).toBe('2026-09-15');
    expect(problems({ paidOn: '08/10/2026' })).toEqual({ paidOn: 'after_today' });
    expect(problems({ paidOn: '31/02/2026' })).toEqual({ paidOn: 'impossible' });
  });

  it('reports the amount and the date together', () => {
    expect(problems({ amount: '0', paidOn: 'hôm qua' })).toEqual({ amount: 'not_positive', paidOn: 'invalid' });
  });

  it('keeps a note as typed, a full ID number included, and drops an empty one', () => {
    expect(schema.parse({ ...base, note: ' CCCD thợ 079123456789 ' }).note).toBe('CCCD thợ 079123456789');
    expect(schema.parse({ ...base, note: '   ' }).note).toBeNull();
  });

  it('takes a new vendor by name with the id the sheet minted', () => {
    const vendor = { kind: 'new', id: '1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f', fullName: ' Thợ điện Demo Phường Tân Đông Hiệp ' };
    expect(schema.parse({ ...base, vendor }).vendor).toEqual({ ...vendor, fullName: 'Thợ điện Demo Phường Tân Đông Hiệp' });
    expect(problems({ vendor: { ...vendor, fullName: ' ' } })).toEqual({ form: 'invalid' });
  });

  it('refuses a category outside the ten', () => {
    expect(problems({ category: 'party' })).toEqual({ form: 'invalid' });
  });
});

describe('EXPENSE_CATEGORIES', () => {
  it('lists the ten SPEC categories in sheet order, each with its own message key', () => {
    expect(EXPENSE_CATEGORY_IDS).toEqual([
      'repair',
      'maintenance',
      'utility',
      'management_fee',
      'land_tax',
      'rental_tax',
      'insurance',
      'broker_fee',
      'legal',
      'other',
    ]);
    expect(new Set(EXPENSE_CATEGORY_IDS.map((id) => EXPENSE_CATEGORIES[id].labelKey)).size).toBe(10);
  });
});
