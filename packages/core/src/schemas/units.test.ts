import { describe, expect, it } from 'vitest';
import { addRoomsSchema, unitSchema, utilityAccountSchema } from './units';

const room = { label: 'Phòng 9', kind: 'room', area_m2: 18.5, list_rent_vnd: 2_800_000, available_from: '2026-08-01' };

describe('unitSchema', () => {
  it('reads a room with its rent and date', () => {
    expect(unitSchema.parse(room)).toEqual(room);
  });

  it.each([
    ['a blank label', { label: '  ' }],
    ['an unknown kind', { kind: 'garage' }],
    ['a negative rent', { list_rent_vnd: -1 }],
    ['a fractional rent', { list_rent_vnd: 2_800_000.5 }],
    ['a zero area', { area_m2: 0 }],
    ['an impossible date', { available_from: '2026-02-30' }],
    ['an extra column', { household_id: 'x' }],
  ])('refuses %s', (_, change) => {
    expect(unitSchema.safeParse({ ...room, ...change }).success).toBe(false);
  });

  it('accepts a unit with only a label and kind', () => {
    expect(unitSchema.parse({ label: 'Toàn bộ', kind: 'whole', area_m2: null, list_rent_vnd: null, available_from: null }).label).toBe('Toàn bộ');
  });
});

describe('utilityAccountSchema', () => {
  it('trims text, reads blanks as null and keeps the unit', () => {
    expect(
      utilityAccountSchema.parse({
        unit_id: '00000000-0000-4000-8000-000000000001',
        kind: 'electricity',
        provider: ' EVN HCMC ',
        customer_code: 'PE0123456789',
        holder_name: '',
        note: null,
      }),
    ).toEqual({ unit_id: '00000000-0000-4000-8000-000000000001', kind: 'electricity', provider: 'EVN HCMC', customer_code: 'PE0123456789', holder_name: null, note: null });
  });

  it('refuses an unknown kind and a code longer than 40 characters', () => {
    const base = { unit_id: null, kind: 'water', provider: null, customer_code: null, holder_name: null, note: null };
    expect(utilityAccountSchema.safeParse({ ...base, kind: 'gas' }).success).toBe(false);
    expect(utilityAccountSchema.safeParse({ ...base, customer_code: 'X'.repeat(41) }).success).toBe(false);
  });
});

describe('addRoomsSchema', () => {
  it('refuses no labels and repeated labels', () => {
    expect(addRoomsSchema.safeParse({ labels: [], list_rent_vnd: null }).success).toBe(false);
    expect(addRoomsSchema.safeParse({ labels: ['Phòng 9', 'Phòng 9'], list_rent_vnd: null }).success).toBe(false);
    expect(addRoomsSchema.parse({ labels: ['Phòng 9'], list_rent_vnd: 2_800_000 }).labels).toEqual(['Phòng 9']);
  });
});
