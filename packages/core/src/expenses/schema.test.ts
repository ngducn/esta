import { describe, expect, it } from 'vitest';
import { isoDate } from '../date/iso-date';
import { MAX_AMOUNT_VND } from '../money/vnd';
import { vndInputText } from '../properties/form-fields';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_IDS } from './categories';
import { readExpense } from './schema';

const today = isoDate('2026-10-07');
const base = {
  id: '6f1c2b8e-9a4d-4c3e-8f7a-1b2c3d4e5f60',
  propertyId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  category: 'repair',
  amount: '2tr5',
  vendor: null,
  receipt: null,
};

function read(input: object) {
  const read = readExpense({ ...base, ...input }, today);
  if (!read.ok) throw new Error(`refused: ${JSON.stringify(read.problems)}`);
  return read.value;
}

function problems(input: object) {
  const read = readExpense({ ...base, ...input }, today);
  if (read.ok) throw new Error('expected a refusal');
  return read.problems;
}

describe('readExpense', () => {
  it('reads 3tr5 as 3.500.000 đồng', () => {
    expect(read({ amount: '3tr5' }).amount).toBe(3_500_000);
  });

  it('refuses 0 as not positive', () => {
    expect(problems({ amount: '0' })).toEqual({ amount: 'not_positive' });
  });

  it('takes the amount ceiling and refuses one đồng over it as too large', () => {
    expect(read({ amount: vndInputText(MAX_AMOUNT_VND) }).amount).toBe(MAX_AMOUNT_VND);
    expect(problems({ amount: vndInputText(MAX_AMOUNT_VND + 1) })).toEqual({ amount: 'too_large' });
    expect(problems({ amount: '1001 tỷ' })).toEqual({ amount: 'too_large' });
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
    expect(read({}).paidOn).toBe('2026-10-07');
    expect(read({ paidOn: '  ' }).paidOn).toBe('2026-10-07');
  });

  it('reads a typed day and refuses one after the Clock date', () => {
    expect(read({ paidOn: '15/09/2026' }).paidOn).toBe('2026-09-15');
    expect(problems({ paidOn: '08/10/2026' })).toEqual({ paidOn: 'after_today' });
    expect(problems({ paidOn: '31/02/2026' })).toEqual({ paidOn: 'impossible' });
  });

  it('reports the amount and the date together', () => {
    expect(problems({ amount: '0', paidOn: 'hôm qua' })).toEqual({ amount: 'not_positive', paidOn: 'invalid' });
  });

  it('keeps a note as typed, a full ID number included, and drops an empty one', () => {
    expect(read({ note: ' CCCD thợ 079123456789 ' }).note).toBe('CCCD thợ 079123456789');
    expect(read({ note: '   ' }).note).toBeNull();
  });

  it('takes a new vendor by name with the id the sheet minted', () => {
    const vendor = { kind: 'new', id: '1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f', fullName: ' Thợ điện Demo Phường Tân Đông Hiệp ' };
    expect(read({ vendor }).vendor).toEqual({ ...vendor, fullName: 'Thợ điện Demo Phường Tân Đông Hiệp' });
    expect(problems({ vendor: { ...vendor, fullName: ' ' } })).toEqual({ form: 'invalid' });
  });

  it('refuses a category outside the ten, and still reads the amount on its field', () => {
    expect(problems({ category: 'party' })).toEqual({ form: 'invalid' });
    expect(problems({ category: '', amount: '0' })).toEqual({ amount: 'not_positive', form: 'invalid' });
  });

  it('takes a receipt photo with what its upload ticket signed, or a receipt already filed', () => {
    const photo = {
      kind: 'new',
      documentId: '2e3f4051-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
      filename: 'hoa-don.jpg',
      mime: 'image/jpeg',
      size: 60_590,
      sha256: 'a'.repeat(64),
      pageCount: 1,
      title: ' Hoá đơn chi phí - Nhà phố Q7 ',
    };
    expect(read({ receipt: photo }).receipt).toEqual({ ...photo, title: 'Hoá đơn chi phí - Nhà phố Q7' });
    expect(read({ receipt: { kind: 'existing', documentId: photo.documentId } }).receipt).toEqual({ kind: 'existing', documentId: photo.documentId });
    expect(problems({ receipt: { ...photo, mime: 'image/gif' } })).toEqual({ form: 'invalid' });
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
